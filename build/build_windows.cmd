@echo off
REM NubraOSS Windows Launcher Builder
REM Run from the repo root: build\build_windows.cmd
REM Requires: pip install pyinstaller pillow

cd /d "%~dp0.."

echo [1/4] Generating icons...
python build\make_icons.py

echo [2/4] Installing PyInstaller...
pip install pyinstaller --quiet

echo [3/4] Building NubraOSS_Windows.exe...
pyinstaller ^
  --onefile ^
  --windowed ^
  --name NubraOSS_Windows ^
  --icon build\nubra.ico ^
  --distpath dist ^
  --workpath build\_pyinstaller_work ^
  --specpath build ^
  launcher.py

echo [4/4] Done.
echo Output: dist\NubraOSS_Windows.exe
pause
