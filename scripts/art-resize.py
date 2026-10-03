#!/usr/bin/env python3
"""Shrinks the generated images to the sizes that the game uses, and writes the manifest.

Usage: python3 scripts/art-resize.py [--check]

The originals are in art/originals/hd at full size. The game files go to public/assets/hd:
512 px on the longest side, backdrops 640 px, the title image 1024 px, interface icons 128 px. The filter is Lanczos.
"""
import shutil
import subprocess
import sys
from pathlib import Path

from PIL import Image

# Longest side of the result, by folder.
SIZES = {"default": 512, "scenes": 640, "ui": 1024, "icons": 128}
ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public" / "assets" / "hd"
ORIGINALS = ROOT / "art" / "originals" / "hd"

check = "--check" in sys.argv

# The original is the source. A public file without an original becomes the original first.
for path in sorted(PUBLIC.rglob("*.png")):
    keep = ORIGINALS / path.relative_to(PUBLIC)
    if not keep.exists():
        keep.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, keep)

count = 0
for keep in sorted(ORIGINALS.rglob("*.png")):
    rel = keep.relative_to(ORIGINALS)
    with Image.open(keep) as img:
        w, h = img.size
        k = SIZES.get(rel.parts[0], SIZES["default"]) / max(w, h)
        size = (max(1, round(w * k)), max(1, round(h * k)))
        if check:
            print(f"{rel}: {w}x{h} -> {size[0]}x{size[1]}")
            continue
        small = img.convert("RGBA").resize(size, Image.LANCZOS)
    path = PUBLIC / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    small.save(path, optimize=True)
    count += 1

# The app icon for the home screen, in the two sizes that the manifest lists.
icon = ORIGINALS / "ui" / "icon.png"
if icon.exists() and not check:
    with Image.open(icon) as img:
        for size in (192, 512):
            img.convert("RGB").resize((size, size), Image.LANCZOS).save(ROOT / "public" / f"icon-{size}.png", optimize=True)

if not check:
    print(f"{count} images written to {PUBLIC.relative_to(ROOT)} from {ORIGINALS.relative_to(ROOT)}")
    subprocess.run(["node", "scripts/art-manifest.mjs"], cwd=ROOT, check=True)
