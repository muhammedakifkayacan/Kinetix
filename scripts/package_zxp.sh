#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DIST_DIR="$REPO_DIR/dist"
OUT_ZIP="$DIST_DIR/Kinetix-v1.0.0.zip"

mkdir -p "$DIST_DIR"
rm -f "$OUT_ZIP"

cd "$REPO_DIR"
zip -r "$OUT_ZIP" CSXS client host .debug README.md \
  -x "*.DS_Store" "dist/*" "tests/*" "scripts/*"

SIZE_BYTES=$(wc -c < "$OUT_ZIP" | tr -d ' ')
echo "Paket olusturuldu: $OUT_ZIP (${SIZE_BYTES} bytes)"
