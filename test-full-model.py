#!/usr/bin/env python3
"""
Test script to use full precision Hugging Face models directly
This uses the transformers library for maximum accuracy
"""

from transformers import pipeline
import json
import sys

def test_classification(model_name="facebook/bart-large-mnli", topic="studying"):
    """
    Test zero-shot classification with full precision models
    """
    print(f"🚀 Loading full precision model: {model_name}")
    
    # Create pipeline with full precision model
    classifier = pipeline(
        "zero-shot-classification",
        model=model_name,
        device=-1  # Use CPU, set to 0 for GPU
    )
    
    # Test cases
    test_texts = [
        # Should be classified as studying
        "function quickSort(arr) { if (arr.length <= 1) return arr; const pivot = arr[arr.length - 1];",
        "Algorithm analysis involves determining the computational complexity of algorithms.",
        "The useState hook lets you add React state to function components.",
        
        # Should NOT be classified as studying  
        "What do you want to play? Connect a device Playlist AirPods Pro This computer",
        "Subscribe and hit the bell icon! Today we're reacting to the latest Marvel trailer.",
        "Add to cart $29.99 Free shipping Customer reviews 4.5 stars",
    ]
    
    print(f"\n📊 Testing with topic: '{topic}'")
    print("-" * 60)
    
    for text in test_texts:
        # Perform classification
        result = classifier(
            text,
            candidate_labels=[topic, f"not {topic}"],
            hypothesis_template="This text is about {}.",
            multi_label=False
        )
        
        # Extract results
        is_studying = result['labels'][0] == topic
        confidence = result['scores'][0]
        
        # Display results
        emoji = "✅" if (is_studying and text.startswith(("function", "Algorithm", "The useState"))) or \
                       (not is_studying and not text.startswith(("function", "Algorithm", "The useState"))) else "❌"
        
        print(f"{emoji} Text: {text[:50]}...")
        print(f"   Classification: {'Studying' if is_studying else 'Idle'}")
        print(f"   Confidence: {confidence:.3f}")
        print()
    
    return classifier

def compare_models():
    """
    Compare different models and topics
    """
    models = [
        "facebook/bart-large-mnli",
        "roberta-large-mnli",
        "microsoft/deberta-v3-large-mnli-fever-anli-ling-wanli",
    ]
    
    topics = ["studying", "computer science", "programming"]
    
    print("\n🔬 Comparing models and topics...")
    print("=" * 80)
    
    for model in models:
        print(f"\nModel: {model}")
        for topic in topics:
            try:
                test_classification(model, topic)
            except Exception as e:
                print(f"❌ Error with {model}: {e}")

if __name__ == "__main__":
    # First install required packages:
    # pip install transformers torch
    
    if len(sys.argv) > 1:
        model = sys.argv[1]
        topic = sys.argv[2] if len(sys.argv) > 2 else "studying"
        test_classification(model, topic)
    else:
        # Test default model
        test_classification()
        
        # Uncomment to compare all models
        # compare_models()