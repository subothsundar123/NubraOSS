#!/usr/bin/env bash
# NubraOSS macOS Launcher
# First run: checks prereqs + sets up dependencies
# Every run: launches the app

set -e
REPO="$(cd "$(dirname "$0")" && pwd)"

echo ""
echo " ================================================"
echo "  NubraOSS"
echo " ================================================"
echo ""

ok()   { echo " [OK] $1"; }

# ── Check prerequisites ───────────────────────────────────────────────────
MISSING=0

# Git
if ! command -v git &>/dev/null; then
  MISSING=1
  echo " [ERROR] Git is not installed."
  echo "         Run: xcode-select --install"
  echo "         Or install Homebrew (https://brew.sh) then: brew install git"
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
  if command -v brew &>/dev/null; then
    echo "         Run: brew install python@3.12"
  else
    echo "         Install Homebrew (https://brew.sh) then: brew install python@3.12"
    echo "         Or download from: https://www.python.org/downloads/"
  fi
  echo ""
else
  ok "$($PYTHON --version)"
fi

# Node.js 18+
if ! command -v node &>/dev/null; then
  MISSING=1
  echo " [ERROR] Node.js is not installed."
  if command -v brew &>/dev/null; then
    echo "         Run: brew install node"
  else
    echo "         Install Homebrew (https://brew.sh) then: brew install node"
    echo "         Or download from: https://nodejs.org/en/download/"
  fi
  echo ""
else
  NODE_VER=$(node --version | tr -d 'v' | cut -d. -f1)
  if [ "$NODE_VER" -lt 18 ] 2>/dev/null; then
    MISSING=1
    echo " [ERROR] Node.js $(node --version) is too old. Need v18+."
    echo "         Run: brew upgrade node   or download from https://nodejs.org"
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

  echo " [1/2] Installing backend dependencies..."
  cd "$REPO/backend"
  $PYTHON -m venv .venv
  .venv/bin/pip install -r requirements.txt --quiet
  ok "Backend ready."
  cd "$REPO"

  echo " [2/2] Installing frontend dependencies..."
  cd "$REPO/frontend"
  npm install --silent
  ok "Frontend ready."
  cd "$REPO"

  echo ""
  echo " Setup complete!"
  echo " Tip: drag NubraOSS-Mac.sh to your Dock for quick access."
fi

# ── Launch ────────────────────────────────────────────────────────────────
echo ""
echo " Launching NubraOSS..."
exec $PYTHON "$REPO/launcher.py"
