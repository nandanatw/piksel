#!/usr/bin/env bash
# Deploy Piksel image generation to Modal
# Prerequisites: pip install modal
# Usage: bash deploy.sh

set -euo pipefail

echo "Deploying Piksel Image Gen to Modal..."
cd "$(dirname "$0")"

modal deploy app.py

echo ""
echo "Deployment complete!"
echo "Set MODAL_ENDPOINT_URL in your .env to the deployed URL"
echo "Set MODAL_API_KEY in your .env for authentication"