#!/usr/bin/env bash
# Deploy Piksel image generation to Modal
# Prerequisites:
#   1. pip install modal
#   2. modal setup
#   3. Create Modal Secret: modal secret create piksel-modal MODAL_API_KEY=your-key
# Usage: bash deploy.sh

set -euo pipefail

echo "Deploying Piksel Image Gen to Modal..."
cd "$(dirname "$0")"

modal deploy app.py

echo ""
echo "Deployment complete!"
echo "Set MODAL_ENDPOINT_URL in your .env to the deployed URL (ends with fastapi-app.modal.run)"
echo "Set MODAL_API_KEY in your .env (must match the Modal Secret value)"