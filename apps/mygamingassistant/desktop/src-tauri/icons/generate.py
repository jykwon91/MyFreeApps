#!/usr/bin/env python3
"""Generate placeholder Tauri icons.

PR 7 ships only placeholder icons (a solid dark-purple square with no
artwork). Future PRs replace these with real artwork via:

    cd apps/mygamingassistant/desktop/src-tauri
    cargo tauri icon ../path/to/source-icon-1024.png

This script is committed (vs. running `cargo tauri icon` once and
committing binaries) so:
  - The placeholder is reproducible by anyone with Python stdlib.
  - The build doesn't depend on imagemagick / convert / Pillow being
    available on the dev machine.
  - The Tauri bundler can find the required files on first checkout
    without an extra setup step.

Run from this directory:

    python3 generate.py

Files generated (paths relative to this script):
  - 32x32.png
  - 128x128.png
  - 128x128@2x.png         (256x256)
  - icon.ico               (Windows; PNG-embedded variant)
  - icon.icns              (macOS; PNG-embedded variant)
"""

from __future__ import annotations

import struct
import zlib
from pathlib import Path

# MGA brand color = dark indigo (matches `theme-color` in
# apps/mygamingassistant/frontend/index.html).
BG_RGBA = (15, 23, 42, 255)  # #0F172A


def make_png(width: int, height: int, rgba: tuple[int, int, int, int]) -> bytes:
    """Build a solid-color RGBA PNG. Pure-stdlib (no Pillow)."""
    r, g, b, a = rgba
    raw_pixels = bytearray()
    for _ in range(height):
        raw_pixels.append(0)  # PNG filter type byte (None) per scanline
        raw_pixels.extend([r, g, b, a] * width)

    def chunk(tag: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)  # 8-bit RGBA
    idat = zlib.compress(bytes(raw_pixels), 9)
    return sig + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b"")


def make_ico(png_bytes: bytes, width: int, height: int) -> bytes:
    """Wrap a PNG in a Windows .ico container (PNG-embedded variant).

    Modern Windows supports PNG-embedded ICOs natively. Tauri's resource
    bundler reads the .ico as a raw blob; format-correctness is what matters,
    not whether it's BMP-encoded vs PNG-encoded.
    """
    # ICONDIR (6 bytes) + ICONDIRENTRY (16 bytes) + PNG data
    icondir = struct.pack("<HHH", 0, 1, 1)  # reserved, type=icon, count=1
    direntry = struct.pack(
        "<BBBBHHII",
        width if width < 256 else 0,
        height if height < 256 else 0,
        0,  # palette count (0 = no palette)
        0,  # reserved
        1,  # color planes
        32,  # bits per pixel
        len(png_bytes),
        22,  # offset = ICONDIR + ICONDIRENTRY
    )
    return icondir + direntry + png_bytes


def make_icns(png_bytes: bytes) -> bytes:
    """Wrap a PNG in a macOS .icns container.

    Uses the `ic09` type code (512x512 PNG) — but we'll actually use `ic07`
    (128x128 PNG) since our placeholder is small. Tauri's bundler reads the
    .icns as a raw blob; the OS will pick the best size for the display.
    """
    # ICNS format:
    #   magic ("icns") + total file size (u32 BE) + chunks
    # Each chunk:
    #   4-byte type code + 4-byte chunk size (u32 BE, includes header) + data
    type_code = b"ic07"  # 128x128 PNG
    chunk_size = 8 + len(png_bytes)
    chunk = type_code + struct.pack(">I", chunk_size) + png_bytes
    total_size = 8 + len(chunk)
    return b"icns" + struct.pack(">I", total_size) + chunk


def main() -> None:
    out_dir = Path(__file__).resolve().parent

    # Standard PNG sizes Tauri's `bundle.icon` references.
    png_32 = make_png(32, 32, BG_RGBA)
    png_128 = make_png(128, 128, BG_RGBA)
    png_256 = make_png(256, 256, BG_RGBA)  # 128x128@2x

    (out_dir / "32x32.png").write_bytes(png_32)
    (out_dir / "128x128.png").write_bytes(png_128)
    (out_dir / "128x128@2x.png").write_bytes(png_256)

    # Windows .ico — embed the 128x128 PNG. We could include multiple sizes
    # but one is enough for the placeholder.
    (out_dir / "icon.ico").write_bytes(make_ico(png_128, 128, 128))

    # macOS .icns — embed the 128x128 PNG as the 128x128 chunk.
    (out_dir / "icon.icns").write_bytes(make_icns(png_128))

    # Also write a 512x512 reference PNG that `cargo tauri icon` can consume
    # when a designer drops in real artwork (just replace this file and rerun).
    png_512 = make_png(512, 512, BG_RGBA)
    (out_dir / "icon.png").write_bytes(png_512)

    print(f"Wrote placeholder icons to {out_dir}")


if __name__ == "__main__":
    main()
