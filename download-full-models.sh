#!/bin/bash

# Script to download full, non-quantized models from Hugging Face
# These are the full precision models without quantization

echo "🤖 Downloading full precision models from Hugging Face..."
echo "This will download several GB of data. Make sure you have enough space."
echo ""

# Create models directory if it doesn't exist
mkdir -p models-full

# Function to download model with git-lfs
download_model() {
    MODEL_NAME=$1
    LOCAL_NAME=$2
    
    echo "📥 Downloading $MODEL_NAME..."
    
    # Check if directory already exists
    if [ -d "models-full/$LOCAL_NAME" ]; then
        echo "⚠️  Directory models-full/$LOCAL_NAME already exists. Removing old version..."
        rm -rf "models-full/$LOCAL_NAME"
    fi
    
    # Clone the model repository
    cd models-full
    GIT_LFS_SKIP_SMUDGE=1 git clone "https://huggingface.co/$MODEL_NAME" "$LOCAL_NAME"
    cd "$LOCAL_NAME"
    
    # Download the actual model files (not quantized)
    git lfs pull --include="*.bin,*.safetensors,*.json,*.txt" --exclude="*onnx*,*quantized*,*q4*,*q8*,*int8*"
    
    cd ../..
    
    echo "✅ Downloaded $MODEL_NAME to models-full/$LOCAL_NAME"
    echo ""
}

# Install git-lfs if not already installed
if ! command -v git-lfs &> /dev/null; then
    echo "📦 Installing git-lfs..."
    brew install git-lfs
    git lfs install
fi

# Download each model
download_model "facebook/bart-large-mnli" "bart-large-mnli"
download_model "roberta-large-mnli" "roberta-large-mnli"
download_model "microsoft/deberta-v3-large-mnli-fever-anli-ling-wanli" "deberta-v3-large"
download_model "typeform/distilbert-base-uncased-mnli" "distilbert-mnli"

echo "🎉 All models downloaded successfully!"
echo ""
echo "📊 Model sizes:"
du -sh models-full/*

echo ""
echo "⚠️  Note: These are full precision models and will use more memory and be slower than quantized versions."
echo "💡 To use these models, update your code to point to the 'models-full' directory."