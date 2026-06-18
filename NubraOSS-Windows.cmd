@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
set REPO=%~dp0

echo.
echo  ================================================
echo   NubraOSS
echo  ================================================
echo.

REM ── Check prerequisites ───────────────────────────────────────────────────
set MISSING=0

python --version >nul 2>&1
if errorlevel 1 (
  set MISSING=1
  echo  [ERROR] Python 3.10+ is not installed.
  echo          Download from: https://www.python.org/downloads/
  echo          Make sure to check "Add Python to PATH" during install.
  echo.
) else (
  python -c "import sys; sys.exit(0 if sys.version_info>=(3,10) else 1)" >nul 2>&1
  if errorlevel 1 (
    set MISSING=1
    for /f "tokens=*" %%v in ('python --version') do echo  [ERROR] %%v is too old. Need Python 3.10+.
    echo          Download from: https://www.python.org/downloads/
    echo.
  ) else (
    for /f "tokens=*" %%v in ('python --version') do echo  [OK] %%v
  )
)

node --version >nul 2>&1
if errorlevel 1 (
  set MISSING=1
  echo  [ERROR] Node.js is not installed.
  echo          Download from: https://nodejs.org/en/download/
  echo.
) else (
  for /f "tokens=*" %%v in ('node --version') do echo  [OK] Node.js %%v
)

git --version >nul 2>&1
if errorlevel 1 (
  set MISSING=1
  echo  [ERROR] Git is not installed.
  echo          Download from: https://git-scm.com/download/win
  echo.
) else (
  for /f "tokens=*" %%v in ('git --version') do echo  [OK] %%v
)

if "%MISSING%"=="1" (
  echo.
  echo  Install the missing tools above, then run this file again.
  echo.
  pause
  exit /b 1
)

REM ── First-time setup if needed ────────────────────────────────────────────
set NEEDS_SETUP=0
if not exist "%REPO%backend\.venv" set NEEDS_SETUP=1
if not exist "%REPO%frontend\node_modules" set NEEDS_SETUP=1

if "%NEEDS_SETUP%"=="1" (
  echo.
  echo  First run detected — setting up NubraOSS...
  echo.

  echo  [1/3] Installing backend dependencies...
  cd "%REPO%backend"
  python -m venv .venv
  .venv\Scripts\pip install -r requirements.txt --quiet
  if errorlevel 1 ( echo  [ERROR] Backend install failed. & pause & exit /b 1 )
  echo  [OK] Backend ready.
  cd "%REPO%"

  echo  [2/3] Installing frontend dependencies...
  cd "%REPO%frontend"
  call npm install --silent
  if errorlevel 1 ( echo  [ERROR] Frontend install failed. & pause & exit /b 1 )
  echo  [OK] Frontend ready.
  cd "%REPO%"

  echo  [3/3] Creating Desktop shortcut...
  pip install pillow --quiet
  python build\make_icons.py >nul 2>&1
  set ICON_PATH=%REPO%build\nubra.ico
  powershell -NoProfile -Command "$ws=New-Object -ComObject WScript.Shell; $sc=$ws.CreateShortcut([System.Environment]::GetFolderPath('Desktop')+'\NubraOSS.lnk'); $sc.TargetPath='%REPO%NubraOSS-Windows.cmd'; $sc.WorkingDirectory='%REPO%'; $sc.IconLocation='%ICON_PATH%'; $sc.Description='NubraOSS Trading Platform'; $sc.Save()"
  echo  [OK] Desktop shortcut created.
  echo.
  echo  Setup complete!
)

REM ── Launch ────────────────────────────────────────────────────────────────
echo.
echo  Launching NubraOSS...
python "%REPO%launcher.py"
