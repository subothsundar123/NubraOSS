#!/usr/bin/env bash
# NubraOSS Linux Launcher
# First run: checks prereqs + sets up dependencies
# Every run: launches the app

set -e
REPO="$(cd "$(dirname "$0")" && pwd)"

echo ""
echo " ================================================"
echo "  NubraOSS"
echo " ================================================"
echo ""

fail() { echo ""; echo " [ERROR] $1"; echo ""; exit 1; }
ok()   { echo " [OK] $1"; }

# ── Check prerequisites ───────────────────────────────────────────────────
MISSING=0

# Git
if ! command -v git &>/dev/null; then
  MISSING=1
  echo " [ERROR] Git is not installed."
  echo "         Run: sudo apt install git   (Ubuntu/Debian)"
  echo "         Or:  sudo dnf install git   (Fedora)"
  echo ""
else
  ok "$(git --version)"
fi

# Python 3.10+
PYTHON=""
for cmd in python3.12 python3.11 python3.10 python3 python; do
  if command -v "$cmd" &>/dev/null; then
    if "$cmd" -c 'import sys; sys.exit(0 if sys.version_info>=(3,10) else 1)' 2>/dev/null; then
      PYTHON="$cmd"; break
    fi
  fi
done

if [ -z "$PYTHON" ]; then
  MISSING=1
  echo " [ERROR] Python 3.10+ is not installed."
  echo "         Run: sudo apt install python3 python3-venv   (Ubuntu/Debian)"
  echo "         Or:  sudo dnf install python3                (Fedora)"
  echo ""
else
  ok "$($PYTHON --version)"
fi

# Node.js 18+
if ! command -v node &>/dev/null; then
  MISSING=1
  echo " [ERROR] Node.js is not installed."
  echo "         Run: curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install nodejs"
  echo "         Or download from: https://nodejs.org/en/download/"
  echo ""
else
  NODE_VER=$(node --version | tr -d 'v' | cut -d. -f1)
  if [ "$NODE_VER" -lt 18 ] 2>/dev/null; then
    MISSING=1
    echo " [ERROR] Node.js $(node --version) is too old. Need v18+."
    echo "         Download from: https://nodejs.org/en/download/"
    echo ""
  else
    ok "Node.js $(node --version)"
  fi
fi

if [ "$MISSING" = "1" ]; then
  echo " Install the missing tools above, then run this file again."
  echo ""
  exit 1
fi

# ── First-time setup if needed ────────────────────────────────────────────
NEEDS_SETUP=0
[ ! -d "$REPO/backend/.venv" ] && NEEDS_SETUP=1
[ ! -d "$REPO/frontend/node_modules" ] && NEEDS_SETUP=1

if [ "$NEEDS_SETUP" = "1" ]; then
  echo ""
  echo " First run detected — setting up NubraOSS..."
  echo ""

  echo " [1/3] Installing backend dependencies..."
  cd "$REPO/backend"
  $PYTHON -m venv .venv
  .venv/bin/pip install -r requirements.txt --quiet
  ok "Backend ready."
  cd "$REPO"

  echo " [2/3] Installing frontend dependencies..."
  cd "$REPO/frontend"
  npm install --silent
  ok "Frontend ready."
  cd "$REPO"

  echo " [3/3] Creating desktop shortcut..."
  ICON="$REPO/frontend/src/assets/nubra.png"
  mkdir -p "$HOME/.local/share/icons/hicolor/256x256/apps"
  cp "$ICON" "$HOME/.local/share/icons/hicolor/256x256/apps/nubraoss.png"
  mkdir -p "$HOME/.local/share/applications"
  cat > "$HOME/.local/share/applications/nubraoss.desktop" <<EOF
[Desktop Entry]
Version=1.0
Type=Application
Name=NubraOSS
Comment=NubraOSS Trading Platform
Exec=bash $REPO/NubraOSS-Linux.sh
Icon=nubraoss
Terminal=false
Categories=Finance;
StartupNotify=true
EOF
  if [ -d "$HOME/Desktop" ]; then
    cp "$HOME/.local/share/applications/nubraoss.desktop" "$HOME/Desktop/NubraOSS.desktop"
    chmod +x "$HOME/Desktop/NubraOSS.desktop"
  fi
  command -v gtk-update-icon-cache &>/dev/null && gtk-update-icon-cache -f -t "$HOME/.local/share/icons/hicolor" 2>/dev/null || true
  command -v update-desktop-database &>/dev/null && update-desktop-database "$HOME/.local/share/applications" 2>/dev/null || true
  ok "Desktop shortcut created."

  echo ""
  echo " Setup complete!"
fi

# ── Launch ────────────────────────────────────────────────────────────────
echo ""
echo " Launching NubraOSS..."
exec $PYTHON "$REPO/launcher.py"
