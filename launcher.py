"""
NubraOSS Launcher — starts backend + frontend and opens the browser.
Run this file directly: python launcher.py
Or use the platform-specific binary built from build/
"""

import os
import platform
import signal
import subprocess
import sys
import time
import webbrowser

REPO_ROOT = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.join(REPO_ROOT, "backend")
FRONTEND_DIR = os.path.join(REPO_ROOT, "frontend")
FRONTEND_URL = "http://localhost:5173"
BACKEND_URL = "http://localhost:8000/health"

IS_WINDOWS = platform.system() == "Windows"
IS_MAC = platform.system() == "Darwin"


def _python() -> str:
    venv_python = os.path.join(BACKEND_DIR, ".venv", "Scripts" if IS_WINDOWS else "bin", "python" + (".exe" if IS_WINDOWS else ""))
    if os.path.isfile(venv_python):
        return venv_python
    return sys.executable


def _node_available() -> bool:
    try:
        subprocess.run(["node", "--version"], capture_output=True, timeout=5, check=True)
        return True
    except Exception:
        return False


def _wait_for_backend(timeout: int = 30) -> bool:
    import urllib.request
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            urllib.request.urlopen(BACKEND_URL, timeout=2)
            return True
        except Exception:
            time.sleep(1)
    return False


def _start_backend() -> subprocess.Popen:
    env = os.environ.copy()
    env["PYTHONUNBUFFERED"] = "1"
    cmd = [_python(), "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000"]
    return subprocess.Popen(cmd, cwd=BACKEND_DIR, env=env)


def _start_frontend() -> subprocess.Popen:
    npm = "npm.cmd" if IS_WINDOWS else "npm"
    return subprocess.Popen([npm, "run", "dev"], cwd=FRONTEND_DIR)


def main() -> None:
    print("NubraOSS Launcher")
    print("=" * 40)

    if not _node_available():
        print("[ERROR] Node.js not found. Install Node.js 18+ and retry.")
        sys.exit(1)

    print("[1/3] Starting backend...")
    backend = _start_backend()

    print("[2/3] Starting frontend...")
    frontend = _start_frontend()

    print("[3/3] Waiting for backend to be ready...")
    if _wait_for_backend(timeout=40):
        print(f"      Backend ready at http://localhost:8000")
    else:
        print("      Backend health check timed out — it may still be loading.")

    time.sleep(3)
    print(f"\nOpening {FRONTEND_URL} ...")
    webbrowser.open(FRONTEND_URL)

    print("\nNubraOSS is running. Press Ctrl+C to stop.\n")

    def _shutdown(sig=None, frame=None):
        print("\nShutting down NubraOSS...")
        for proc in (frontend, backend):
            try:
                if IS_WINDOWS:
                    proc.terminate()
                else:
                    proc.send_signal(signal.SIGTERM)
            except Exception:
                pass
        for proc in (frontend, backend):
            try:
                proc.wait(timeout=8)
            except Exception:
                proc.kill()
        print("Stopped.")
        sys.exit(0)

    signal.signal(signal.SIGINT, _shutdown)
    signal.signal(signal.SIGTERM, _shutdown)

    # Keep alive
    while True:
        if backend.poll() is not None:
            print("[WARN] Backend process exited unexpectedly.")
        if frontend.poll() is not None:
            print("[WARN] Frontend process exited unexpectedly.")
        time.sleep(5)


if __name__ == "__main__":
    main()
