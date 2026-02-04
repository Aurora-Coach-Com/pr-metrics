#!/bin/bash

# Local test script for Sprint Health Action
# Usage: ./test-local.sh [repo]
#
# Examples:
#   ./test-local.sh                    # Uses repo from .env file
#   ./test-local.sh owner/repo         # Uses specified repo

set -e

echo "🧪 Sprint Health Action - Local Test"
echo "====================================="
echo ""

echo "📦 Installing dependencies..."
npm install --silent

echo ""
if [ -n "$1" ]; then
    echo "🚀 Running against: $1"
    GITHUB_REPOSITORY="$1" npm run dev
else
    echo "🚀 Running against repo from .env"
    npm run dev
fi
