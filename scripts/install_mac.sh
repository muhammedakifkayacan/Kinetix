#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
EXT_NAME="com.kinetix.premiere"

# CEP imzasiz yerel eklentiler icin PlayerDebugMode aktif edilir
defaults write com.adobe.CSXS.11 PlayerDebugMode 1
defaults write com.adobe.CSXS.12 PlayerDebugMode 1

USER_CEP_DIR="$HOME/Library/Application Support/Adobe/CEP/extensions"
GLOBAL_CEP_DIR="/Library/Application Support/Adobe/CEP/extensions"

if [ -w "$GLOBAL_CEP_DIR" ]; then
  TARGET_DIR="$GLOBAL_CEP_DIR/$EXT_NAME"
else
  mkdir -p "$USER_CEP_DIR"
  TARGET_DIR="$USER_CEP_DIR/$EXT_NAME"
fi

rm -rf "$TARGET_DIR"
mkdir -p "$TARGET_DIR"

cp -R "$REPO_DIR/CSXS" "$TARGET_DIR/"
cp -R "$REPO_DIR/client" "$TARGET_DIR/"
cp -R "$REPO_DIR/host" "$TARGET_DIR/"
cp "$REPO_DIR/.debug" "$TARGET_DIR/"

echo ""
echo "============================================"
echo " Kinetix Premiere Pro eklentisi kuruldu!"
echo " Konum: $TARGET_DIR"
echo "============================================"
echo " Premiere Pro'yu yeniden baslatin ve"
echo " Window > Extensions > Kinetix menusunu acin."
echo ""
