#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

# prerequisites check
if ! command -v git >/dev/null; then
  echo "git required" >&2
  exit 1
fi
if ! command -v git-lfs >/dev/null; then
  echo "git-lfs required" >&2
  exit 1
fi

git lfs install --force

echo "Downloading full precision models from Hugging Face..."
echo "Make sure you're authenticated (e.g., ran 'huggingface-cli login')."
echo ""

mkdir -p models-full

declare -a MODELS=(
  "facebook/bart-large-mnli:bart-large-mnli"
  "roberta-large-mnli:roberta-large-mnli"
  "microsoft/deberta-v3-large-mnli-fever-anli-ling-wanli:deberta-v3-large"
  "typeform/distilbert-base-uncased-mnli:distilbert-mnli"
)

for entry in "${MODELS[@]}"; do
  IFS=":" read -r repo local_name <<< "$entry"
  echo "📥 Downloading ${repo} into models-full/${local_name}..."
  rm -rf "models-full/${local_name}"
  GIT_LFS_SKIP_SMUDGE=1 git clone "https://huggingface.co/${repo}" "models-full/${local_name}"
  pushd "models-full/${local_name}" >/dev/null
  git lfs pull --include="*.bin,*.safetensors,*.json,*.txt"
  popd >/dev/null
  echo "✅ Done ${repo}"
  echo ""
done

echo "🎉 All models fetched."
echo ""
echo "📊 Sizes:"
du -sh models-full/*
