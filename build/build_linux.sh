#!/usr/bin/env bash
# NubraOSS Linux Launcher Builder
# Run from the repo root: bash build/build_linux.sh
# Requires: pip install pyinstaller pillow

set -e
cd "$(dirname "$0")/.."

echo "[1/3] Installing PyInstaller..."
pip3 install pyinstaller --quiet

echo "[2/3] Building NubraOSS_Linux binary..."
pyinstaller \
  --onefile \
  --name NubraOSS_Linux \
  --distpath dist \
  --workpath build/_pyinstaller_work \
  --specpath build \
  launcher.py

echo "[3/3] Done."
echo "Output: dist/NubraOSS_Linux"
echo "Make executable: chmod +x dist/NubraOSS_Linux"
chmod +x dist/NubraOSS_Linux 2>/dev/null || true
