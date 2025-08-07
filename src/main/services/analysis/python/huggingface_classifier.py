#!/usr/bin/env python3
"""
HuggingFace Zero-Shot Classification Service
This service provides zero-shot classification using HuggingFace transformers
"""

import json
import sys
import os
from typing import List, Dict, Any
from transformers import pipeline
import warnings

# Suppress warnings
warnings.filterwarnings("ignore")
os.environ['TOKENIZERS_PARALLELISM'] = 'false'

class HuggingFaceClassifier:
    def __init__(self, model_name: str = "facebook/bart-large-mnli"):
        """Initialize the classifier with a specific model."""
        self.model_name = model_name
        self.pipe = None
        self._initialize_pipeline()
    
    def _initialize_pipeline(self):
        """Initialize the zero-shot classification pipeline."""
        try:
            self.pipe = pipeline(
                "zero-shot-classification", 
                model=self.model_name,
                device="mps" if sys.platform == "darwin" else None  # Use Apple Silicon GPU if available
            )
            print(json.dumps({
                "type": "initialized",
                "model": self.model_name,
                "status": "success"
            }), flush=True)
        except Exception as e:
            print(json.dumps({
                "type": "error",
                "error": f"Failed to initialize model: {str(e)}"
            }), flush=True)
            sys.exit(1)
    
    def classify(self, text: str, labels: List[str], multi_label: bool = False) -> Dict[str, Any]:
        """
        Classify text against provided labels.
        
        Args:
            text: The text to classify
            labels: List of candidate labels
            multi_label: Whether to allow multiple labels
            
        Returns:
            Classification results with scores
        """
        if not self.pipe:
            return {"error": "Pipeline not initialized"}
        
        try:
            result = self.pipe(
                text, 
                candidate_labels=labels,
                multi_label=multi_label
            )
            
            # Format result for consistency
            return {
                "type": "classification",
                "labels": result['labels'],
                "scores": result['scores'],
                "sequence": result['sequence'][:100] + "..." if len(result['sequence']) > 100 else result['sequence']
            }
        except Exception as e:
            return {
                "type": "error",
                "error": f"Classification failed: {str(e)}"
            }
    
    def process_command(self, command: Dict[str, Any]) -> Dict[str, Any]:
        """Process a command from the Node.js side."""
        cmd_type = command.get("type")
        
        if cmd_type == "classify":
            text = command.get("text", "")
            labels = command.get("labels", [])
            multi_label = command.get("multi_label", False)
            return self.classify(text, labels, multi_label)
        elif cmd_type == "ping":
            return {"type": "pong", "status": "ready"}
        elif cmd_type == "shutdown":
            return {"type": "shutdown", "status": "acknowledged"}
        else:
            return {"type": "error", "error": f"Unknown command type: {cmd_type}"}


def main():
    """Main entry point for the service."""
    # Get model name from environment or use default
    model_name = os.environ.get("HUGGINGFACE_MODEL", "facebook/bart-large-mnli")
    
    # Initialize classifier
    classifier = HuggingFaceClassifier(model_name)
    
    # Process commands from stdin
    try:
        for line in sys.stdin:
            line = line.strip()
            if not line:
                continue
            
            try:
                command = json.loads(line)
                result = classifier.process_command(command)
                print(json.dumps(result), flush=True)
                
                if result.get("type") == "shutdown":
                    break
            except json.JSONDecodeError as e:
                print(json.dumps({
                    "type": "error",
                    "error": f"Invalid JSON: {str(e)}"
                }), flush=True)
            except Exception as e:
                print(json.dumps({
                    "type": "error", 
                    "error": f"Processing error: {str(e)}"
                }), flush=True)
    except KeyboardInterrupt:
        pass
    finally:
        print(json.dumps({"type": "shutdown", "status": "complete"}), flush=True)


if __name__ == "__main__":
    main()