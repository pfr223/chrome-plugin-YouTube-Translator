#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="$ROOT_DIR/dist"
PACKAGE_NAME="youtube-context-translator-$(node -p "require('$ROOT_DIR/package.json').version").zip"
PACKAGE_PATH="$DIST_DIR/$PACKAGE_NAME"

cd "$ROOT_DIR"
mkdir -p "$DIST_DIR"
rm -f "$PACKAGE_PATH"

python3 scripts/generate-store-assets.py >/dev/null

zip -r "$PACKAGE_PATH" \
  manifest.json \
  src \
  assets/icons \
  -x '*.DS_Store' >/dev/null

echo "$PACKAGE_PATH"
