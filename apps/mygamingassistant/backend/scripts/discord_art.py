"""Drawing kit shared by the raid bot's art generators.

``generate_discord_emojis.py`` (icons, letter tiles) and
``generate_raid_banners.py`` (the raid posts' banners) draw with the same
game-icons.net glyphs (CC BY 3.0), the same font (Cinzel, SIL OFL 1.1) and
these helpers.

Downloads (glyph PNGs, the font) are cached in the OS temp dir; everything
else is plain Pillow, so the generators' output is byte-stable for the same
inputs and Pillow version.
"""
from __future__ import annotations

import io
import tempfile
import urllib.error
import urllib.request
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageChops, ImageFont

CACHE_DIR = Path(tempfile.gettempdir()) / "mga_discord_emoji_cache"

GLYPH_URL = "https://game-icons.net/icons/ffffff/transparent/1x1/{author}/{slug}.png"
FONT_URL = "https://raw.githubusercontent.com/google/fonts/main/ofl/cinzel/Cinzel%5Bwght%5D.ttf"
FONT_WEIGHT = 900


@dataclass(frozen=True)
class Glyph:
    author: str
    slug: str

    @property
    def credit(self) -> str:
        return f"{self.slug} by {self.author}"


# ---------------------------------------------------------------------------
# Downloads
# ---------------------------------------------------------------------------


def download(url: str, target: Path) -> bytes:
    if target.exists():
        return target.read_bytes()
    target.parent.mkdir(parents=True, exist_ok=True)
    request = urllib.request.Request(url, headers={"User-Agent": "MyGamingAssistant art generator"})
    try:
        with urllib.request.urlopen(request, timeout=30) as response:  # noqa: S310 — fixed https URLs
            data = response.read()
    except urllib.error.HTTPError as exc:
        raise SystemExit(f"Download failed ({exc.code}): {url}") from exc
    target.write_bytes(data)
    return data


def load_glyph(glyph: Glyph) -> Image.Image:
    data = download(
        GLYPH_URL.format(author=glyph.author, slug=glyph.slug),
        CACHE_DIR / "glyphs" / glyph.author / f"{glyph.slug}.png",
    )
    return Image.open(io.BytesIO(data)).convert("RGBA")


def load_font(size: int) -> ImageFont.FreeTypeFont:
    path = CACHE_DIR / "Cinzel-wght.ttf"
    download(FONT_URL, path)
    font = ImageFont.truetype(str(path), size)
    font.set_variation_by_axes([FONT_WEIGHT])
    return font


# ---------------------------------------------------------------------------
# Color
# ---------------------------------------------------------------------------


def rgb(hex_color: str) -> tuple[int, int, int]:
    value = hex_color.lstrip("#")
    return int(value[0:2], 16), int(value[2:4], 16), int(value[4:6], 16)


def mix(color: tuple[int, int, int], other: tuple[int, int, int], amount: float) -> tuple[int, int, int]:
    return tuple(round(c + (o - c) * amount) for c, o in zip(color, other))  # type: ignore[return-value]


def luminance(color: tuple[int, int, int]) -> float:
    def channel(value: int) -> float:
        s = value / 255
        return s / 12.92 if s <= 0.03928 else ((s + 0.055) / 1.055) ** 2.4

    r, g, b = (channel(v) for v in color)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(a: float, b: float) -> float:
    """WCAG contrast ratio between two relative luminances."""
    high, low = max(a, b), min(a, b)
    return (high + 0.05) / (low + 0.05)


# ---------------------------------------------------------------------------
# Glyphs
# ---------------------------------------------------------------------------


def fit(glyph: Image.Image, box: int) -> Image.Image:
    """The glyph's ink, scaled so its longer side is ``box`` px."""
    bbox = glyph.getbbox()
    if bbox:
        glyph = glyph.crop(bbox)
    scale = box / max(glyph.size)
    size = (max(1, round(glyph.width * scale)), max(1, round(glyph.height * scale)))
    return glyph.resize(size, Image.Resampling.LANCZOS)


def colorize(glyph: Image.Image, ink: tuple[int, int, int, int]) -> Image.Image:
    """The glyph's shape filled with ``ink`` (its alpha scales the glyph's)."""
    alpha = glyph.getchannel("A")
    solid = Image.new("RGBA", glyph.size, ink)
    solid.putalpha(ImageChops.multiply(alpha, Image.new("L", glyph.size, ink[3])))
    return solid


# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------


def png_bytes(image: Image.Image) -> bytes:
    buffer = io.BytesIO()
    image.save(buffer, format="PNG", optimize=True)
    return buffer.getvalue()


def write_pngs(out_dir: Path, images: Mapping[str, Image.Image]) -> tuple[int, int]:
    """Write ``<name>.png`` for each image; drop PNGs no image names.

    An unchanged image isn't rewritten, so a re-run leaves git clean.
    Returns (written, removed).
    """
    out_dir.mkdir(parents=True, exist_ok=True)
    written = 0
    for name, image in sorted(images.items()):
        target = out_dir / f"{name}.png"
        data = png_bytes(image)
        if target.exists() and target.read_bytes() == data:
            continue
        target.write_bytes(data)
        written += 1
    stale = sorted(path for path in out_dir.glob("*.png") if path.stem not in images)
    for path in stale:
        path.unlink()
    return written, len(stale)
