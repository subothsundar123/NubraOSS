#!/usr/bin/env bash
# NubraOSS macOS Launcher Builder
# Run from the repo root: bash build/build_mac.sh
# Requires: pip install pyinstaller pillow
# For icns: brew install libicns

set -e
cd "$(dirname "$0")/.."

echo "[1/4] Generating icons..."
python3 build/make_icons.py

echo "[2/4] Installing PyInstaller..."
pip3 install pyinstaller --quiet

echo "[3/4] Building NubraOSS_Mac app bundle..."
pyinstaller \
  --onefile \
  --windowed \
  --name NubraOSS_Mac \
  --icon build/nubra.icns \
  --distpath dist \
  --workpath build/_pyinstaller_work \
  --specpath build \
  launcher.py

echo "[4/4] Done."
echo "Output: dist/NubraOSS_Mac"
