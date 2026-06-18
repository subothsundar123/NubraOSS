"""
Convert nubra.png → nubra.ico (Windows) and nubra.icns (macOS).
Run from the repo root: python build/make_icons.py

Requires Pillow: pip install pillow
For macOS icns: also requires png2icns (brew install libicns)
"""

import os
import subprocess
import sys

try:
    from PIL import Image
except ImportError:
    sys.exit("[ERROR] Pillow not installed. Run: pip install pillow")

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_PNG = os.path.join(REPO_ROOT, "frontend", "src", "assets", "nubra.png")
OUT_ICO = os.path.join(REPO_ROOT, "build", "nubra.ico")
OUT_ICNS = os.path.join(REPO_ROOT, "build", "nubra.icns")
TMP_DIR = os.path.join(REPO_ROOT, "build", "_icns_tmp")


def make_ico(src: str, out: str) -> None:
    img = Image.open(src).convert("RGBA")
    sizes = [(16,16),(32,32),(48,48),(64,64),(128,128),(256,256)]
    resized = [img.resize(s, Image.LANCZOS) for s in sizes]
    resized[0].save(out, format="ICO", sizes=sizes)
    print(f"  Created {out}")


def make_icns(src: str, out: str) -> None:
    os.makedirs(TMP_DIR, exist_ok=True)
    img = Image.open(src).convert("RGBA")
    icns_sizes = {
        "icon_16x16.png": 16,
        "icon_32x32.png": 32,
        "icon_32x32@2x.png": 64,
        "icon_128x128.png": 128,
        "icon_128x128@2x.png": 256,
        "icon_256x256.png": 256,
        "icon_256x256@2x.png": 512,
        "icon_512x512.png": 512,
        "icon_512x512@2x.png": 1024,
    }
    for name, size in icns_sizes.items():
        img.resize((size, size), Image.LANCZOS).save(os.path.join(TMP_DIR, name))
    try:
        subprocess.run(["png2icns", out] + [os.path.join(TMP_DIR, n) for n in icns_sizes], check=True)
        print(f"  Created {out}")
    except FileNotFoundError:
        print("  [SKIP] png2icns not found. On macOS: brew install libicns")
    except subprocess.CalledProcessError as e:
        print(f"  [ERROR] png2icns failed: {e}")


if __name__ == "__main__":
    if not os.path.isfile(SRC_PNG):
        sys.exit(f"[ERROR] Source PNG not found: {SRC_PNG}")

    print("Building icons...")
    make_ico(SRC_PNG, OUT_ICO)
    if sys.platform == "darwin":
        make_icns(SRC_PNG, OUT_ICNS)
    else:
        print("  [SKIP] icns generation only runs on macOS")
    print("Done.")
