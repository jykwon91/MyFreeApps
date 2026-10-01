"""Generate the raid bot's Discord emoji art -> backend/data/discord_emojis/.

Our own icons, never Blizzard's or Raid-Helper's:

* class / spec / role / status icons: a game-icons.net glyph (CC BY 3.0,
  credited per icon in NOTICE.md) on a rounded tile in the class color (the
  community-standard WoW class palette) or a role/status color;
* info-row and button icons (date, time, sign-ups, ..., the settings gear):
  the bare glyph in white with a dark outline, for sitting beside text like
  Raid-Helper's line icons — the outline keeps them visible on Discord's
  light theme too;
* title letter tiles (A-Z, 0-9, a little punctuation): Cinzel Black (SIL OFL
  1.1) on a parchment tile.

Every PNG's file stem is its logical emoji name (see
``app/services/discord/emojis.py``).  The deploy's ``discord-sync-emojis``
step uploads whatever changed: the emoji name carries a hash of the image.

Run from apps/mygamingassistant/backend:

    python scripts/generate_discord_emojis.py
    python scripts/generate_discord_emojis.py --sheet sheet.png   # + preview

Downloads (glyph PNGs, the font) are cached in the OS temp dir.  Output is
byte-stable for the same inputs and Pillow version, so a re-run without art
changes leaves git clean.
"""
from __future__ import annotations

import argparse
import io
import sys
import tempfile
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

BACKEND_DIR = Path(__file__).resolve().parents[1]
OUT_DIR = BACKEND_DIR / "data" / "discord_emojis"
CACHE_DIR = Path(tempfile.gettempdir()) / "mga_discord_emoji_cache"

GLYPH_URL = "https://game-icons.net/icons/ffffff/transparent/1x1/{author}/{slug}.png"
FONT_URL = "https://raw.githubusercontent.com/google/fonts/main/ofl/cinzel/Cinzel%5Bwght%5D.ttf"
FONT_WEIGHT = 900

SIZE = 128
TILE_MARGIN = 4
TILE_RADIUS = 24
GLYPH_BOX = 88
LINE_GLYPH_BOX = 104
LINE_OUTLINE = 6  # px around a line glyph; ~1 px at Discord's 22 px emoji size

INK_DARK = (24, 20, 16, 255)
INK_LIGHT = (255, 255, 255, 255)
OUTLINE_INK = (30, 31, 34, 255)

PARCHMENT = "#efe4cc"
PARCHMENT_INK = (43, 29, 14, 255)
PARCHMENT_EDGE = "#6b5233"


@dataclass(frozen=True)
class Glyph:
    author: str
    slug: str

    @property
    def credit(self) -> str:
        return f"{self.slug} by {self.author}"


@dataclass(frozen=True)
class TileIcon:
    name: str
    glyph: Glyph
    color: str


@dataclass(frozen=True)
class LineIcon:
    name: str
    glyph: Glyph


def _g(path: str) -> Glyph:
    author, slug = path.split("/")
    return Glyph(author, slug)


# Community-standard class colors.
CLASS_COLORS = {
    "warrior": "#c69b6d",
    "paladin": "#f48cba",
    "hunter": "#aad372",
    "rogue": "#fff468",
    "priest": "#f0f0f0",
    "shaman": "#0070dd",
    "mage": "#3fc7eb",
    "warlock": "#8788ee",
    "druid": "#ff7c0a",
}

CLASS_GLYPHS = {
    "warrior": "lorc/heavy-helm",
    "paladin": "delapouite/warhammer",
    "hunter": "lorc/bowman",
    "rogue": "lorc/cloak-dagger",
    "priest": "lorc/prayer",
    "shaman": "lorc/totem-mask",
    "mage": "delapouite/wizard-face",
    "warlock": "delapouite/warlock-hood",
    "druid": "lorc/paw",
}

# (class, spec) -> glyph; spec keys mirror frontend classes.ts with "_" for "-".
SPEC_GLYPHS = {
    ("warrior", "arms"): "lorc/battle-axe",
    ("warrior", "fury"): "delapouite/enrage",
    ("warrior", "protection"): "delapouite/viking-shield",
    ("paladin", "holy"): "lorc/sunbeams",
    ("paladin", "protection"): "delapouite/templar-shield",
    ("paladin", "retribution"): "lorc/winged-sword",
    ("hunter", "beast_mastery"): "lorc/wolf-head",
    ("hunter", "marksmanship"): "lorc/archery-target",
    ("hunter", "survival"): "lorc/wolf-trap",
    ("rogue", "assassination"): "lorc/poison-bottle",
    ("rogue", "combat"): "lorc/crossed-sabres",
    ("rogue", "subtlety"): "lorc/domino-mask",
    ("priest", "discipline"): "lorc/magic-shield",
    ("priest", "holy"): "lorc/holy-grail",
    ("priest", "shadow"): "lorc/tentacles-skull",
    ("shaman", "elemental"): "lorc/lightning-helix",
    ("shaman", "enhancement"): "lorc/thor-fist",
    ("shaman", "restoration"): "lorc/droplets",
    ("mage", "arcane"): "lorc/magic-swirl",
    ("mage", "fire"): "lorc/fireball",
    ("mage", "frost"): "lorc/snowflake-2",
    ("warlock", "affliction"): "lorc/candle-skull",
    ("warlock", "demonology"): "lorc/imp",
    ("warlock", "destruction"): "lorc/burning-meteor",
    ("druid", "balance"): "lorc/moon",
    ("druid", "feral_damage"): "delapouite/saber-toothed-cat-head",
    ("druid", "feral_tank"): "delapouite/bear-head",
    ("druid", "restoration"): "delapouite/tree-growth",
}

ROLE_ICONS = (
    TileIcon("role_tank", _g("lorc/checked-shield"), "#3d6fb0"),
    TileIcon("role_healer", _g("zeromancer/heart-plus"), "#3a9d4f"),
    TileIcon("role_melee", _g("lorc/crossed-swords"), "#c0392b"),
    TileIcon("role_ranged", _g("lorc/on-target"), "#d68910"),
    TileIcon("role_dps", _g("lorc/sword-clash"), "#a93226"),
)

STATUS_ICONS = (
    TileIcon("status_signed", _g("delapouite/check-mark"), "#2e8b57"),
    TileIcon("status_late", _g("delapouite/alarm-clock"), "#c77d1a"),
    TileIcon("status_tentative", _g("sbed/help"), "#b8860b"),
    TileIcon("status_bench", _g("delapouite/park-bench"), "#6c7a89"),
    TileIcon("status_absence", _g("sbed/cancel"), "#8e2b2b"),
    TileIcon("status_queued", _g("lorc/hourglass"), "#4b5d73"),
)

LINE_ICONS = (
    LineIcon("info_date", _g("delapouite/calendar")),
    LineIcon("info_time", _g("lorc/stopwatch")),
    LineIcon("info_signups", _g("delapouite/meeple-group")),
    LineIcon("info_leader", _g("lorc/crown")),
    LineIcon("info_countdown", _g("lorc/sands-of-time")),
    LineIcon("info_lock", _g("lorc/padlock")),
    LineIcon("info_globe", _g("lorc/world")),
    LineIcon("ui_gear", _g("lorc/cog")),
)

# Title tiles: logical-name suffix -> character drawn.
LETTER_TILES = {
    **{chr(code): chr(code).upper() for code in range(ord("a"), ord("z") + 1)},
    **{str(digit): str(digit) for digit in range(10)},
    "apos": "'",
    "dash": "-",
    "amp": "&",
    "excl": "!",
    "qmark": "?",
    "dot": ".",
    "colon": ":",
    "comma": ",",
}


def tile_icons() -> list[TileIcon]:
    icons = [TileIcon(key, _g(CLASS_GLYPHS[key]), color) for key, color in CLASS_COLORS.items()]
    icons += [
        TileIcon(f"{wow_class}_{spec}", _g(glyph), CLASS_COLORS[wow_class])
        for (wow_class, spec), glyph in SPEC_GLYPHS.items()
    ]
    icons += [*ROLE_ICONS, *STATUS_ICONS]
    return icons


# ---------------------------------------------------------------------------
# Downloads
# ---------------------------------------------------------------------------


def _download(url: str, target: Path) -> bytes:
    if target.exists():
        return target.read_bytes()
    target.parent.mkdir(parents=True, exist_ok=True)
    request = urllib.request.Request(url, headers={"User-Agent": "MyGamingAssistant emoji generator"})
    try:
        with urllib.request.urlopen(request, timeout=30) as response:  # noqa: S310 — fixed https URLs
            data = response.read()
    except urllib.error.HTTPError as exc:
        raise SystemExit(f"Download failed ({exc.code}): {url}") from exc
    target.write_bytes(data)
    return data


def load_glyph(glyph: Glyph) -> Image.Image:
    data = _download(
        GLYPH_URL.format(author=glyph.author, slug=glyph.slug),
        CACHE_DIR / "glyphs" / glyph.author / f"{glyph.slug}.png",
    )
    return Image.open(io.BytesIO(data)).convert("RGBA")


def load_font(size: int) -> ImageFont.FreeTypeFont:
    path = CACHE_DIR / "Cinzel-wght.ttf"
    _download(FONT_URL, path)
    font = ImageFont.truetype(str(path), size)
    font.set_variation_by_axes([FONT_WEIGHT])
    return font


# ---------------------------------------------------------------------------
# Drawing
# ---------------------------------------------------------------------------


def _rgb(hex_color: str) -> tuple[int, int, int]:
    value = hex_color.lstrip("#")
    return int(value[0:2], 16), int(value[2:4], 16), int(value[4:6], 16)


def _mix(color: tuple[int, int, int], other: tuple[int, int, int], amount: float) -> tuple[int, int, int]:
    return tuple(round(c + (o - c) * amount) for c, o in zip(color, other))  # type: ignore[return-value]


def _luminance(color: tuple[int, int, int]) -> float:
    def channel(value: int) -> float:
        s = value / 255
        return s / 12.92 if s <= 0.03928 else ((s + 0.055) / 1.055) ** 2.4

    r, g, b = (channel(v) for v in color)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def _contrast(a: float, b: float) -> float:
    high, low = max(a, b), min(a, b)
    return (high + 0.05) / (low + 0.05)


def _tile_mask() -> Image.Image:
    mask = Image.new("L", (SIZE, SIZE), 0)
    box = (TILE_MARGIN, TILE_MARGIN, SIZE - 1 - TILE_MARGIN, SIZE - 1 - TILE_MARGIN)
    ImageDraw.Draw(mask).rounded_rectangle(box, radius=TILE_RADIUS, fill=255)
    return mask


def draw_tile(base_hex: str, *, edge_hex: str | None = None) -> Image.Image:
    """A rounded tile: vertical gradient of the color, darker edge."""
    base = _rgb(base_hex)
    top = _mix(base, (255, 255, 255), 0.18)
    bottom = _mix(base, (0, 0, 0), 0.22)
    gradient = Image.new("RGBA", (SIZE, SIZE))
    pixels = gradient.load()
    for y in range(SIZE):
        row = _mix(top, bottom, y / (SIZE - 1))
        for x in range(SIZE):
            pixels[x, y] = (*row, 255)

    mask = _tile_mask()
    tile = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    tile.paste(gradient, (0, 0), mask)

    edge = _rgb(edge_hex) if edge_hex else _mix(base, (0, 0, 0), 0.5)
    box = (TILE_MARGIN, TILE_MARGIN, SIZE - 1 - TILE_MARGIN, SIZE - 1 - TILE_MARGIN)
    ImageDraw.Draw(tile).rounded_rectangle(box, radius=TILE_RADIUS, outline=(*edge, 255), width=4)
    return tile


def _fit(glyph: Image.Image, box: int) -> Image.Image:
    bbox = glyph.getbbox()
    if bbox:
        glyph = glyph.crop(bbox)
    scale = box / max(glyph.size)
    size = (max(1, round(glyph.width * scale)), max(1, round(glyph.height * scale)))
    return glyph.resize(size, Image.Resampling.LANCZOS)


def _colorize(glyph: Image.Image, ink: tuple[int, int, int, int]) -> Image.Image:
    alpha = glyph.getchannel("A")
    solid = Image.new("RGBA", glyph.size, ink)
    solid.putalpha(ImageChops.multiply(alpha, Image.new("L", glyph.size, ink[3])))
    return solid


def _with_shadow(layer: Image.Image, ink: tuple[int, int, int, int]) -> Image.Image:
    """Soft drop shadow behind a light glyph (dark glyphs get none)."""
    if ink != INK_LIGHT:
        return layer
    shadow = Image.new("RGBA", layer.size, (0, 0, 0, 0))
    dark = _colorize(layer, (0, 0, 0, 150))
    shadow.paste(dark, (2, 3), dark)
    shadow = shadow.filter(ImageFilter.GaussianBlur(2))
    return Image.alpha_composite(shadow, layer)


def _center(layer: Image.Image, piece: Image.Image) -> Image.Image:
    canvas = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    canvas.paste(piece, ((SIZE - piece.width) // 2, (SIZE - piece.height) // 2), piece)
    return Image.alpha_composite(layer, canvas)


def render_tile_icon(icon: TileIcon) -> Image.Image:
    tile_color = _rgb(icon.color)
    tile_lum = _luminance(tile_color)
    ink = INK_LIGHT
    if _contrast(tile_lum, _luminance(INK_DARK[:3])) > _contrast(tile_lum, 1.0):
        ink = INK_DARK
    glyph = _colorize(_fit(load_glyph(icon.glyph), GLYPH_BOX), ink)
    glyph_layer = _center(Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0)), glyph)
    return Image.alpha_composite(draw_tile(icon.color), _with_shadow(glyph_layer, ink))


def _outlined(glyph: Image.Image, ink: tuple[int, int, int, int], width: int) -> Image.Image:
    """The glyph in ``ink`` over a ``width``-px :data:`OUTLINE_INK` halo."""
    padded = Image.new("RGBA", (glyph.width + 2 * width, glyph.height + 2 * width), (0, 0, 0, 0))
    padded.paste(glyph, (width, width), glyph)
    halo = padded.getchannel("A").filter(ImageFilter.MaxFilter(2 * width + 1))
    outline = Image.new("RGBA", padded.size, OUTLINE_INK)
    outline.putalpha(halo)
    return Image.alpha_composite(outline, _colorize(padded, ink))


def render_line_icon(icon: LineIcon) -> Image.Image:
    glyph = _outlined(_fit(load_glyph(icon.glyph), LINE_GLYPH_BOX), INK_LIGHT, LINE_OUTLINE)
    return _center(Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0)), glyph)


LETTER_SIZES = range(98, 40, -2)
LETTER_INNER = (14, SIZE - 14)  # glyph ink must stay inside the tile border


def _letter_position(draw: ImageDraw.ImageDraw, char: str, font: ImageFont.FreeTypeFont) -> tuple[float, float]:
    """Center horizontally on the glyph; vertically on the capital-H band.

    Sharing the cap band keeps a word's baseline straight across tiles, so
    an apostrophe sits high and a comma sits low, like in print.
    """
    left, _, right, _ = draw.textbbox((0, 0), char, font=font)
    _, cap_top, _, cap_bottom = draw.textbbox((0, 0), "H", font=font)
    return (SIZE - (right - left)) / 2 - left, (SIZE - (cap_bottom - cap_top)) / 2 - cap_top


def render_letter_tile(char: str) -> Image.Image:
    """Parchment tile with the character at the largest size that fits."""
    tile = draw_tile(PARCHMENT, edge_hex=PARCHMENT_EDGE)
    text = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(text)
    low, high = LETTER_INNER
    for size in LETTER_SIZES:
        font = load_font(size)
        x, y = _letter_position(draw, char, font)
        left, top, right, bottom = draw.textbbox((x, y), char, font=font)
        if left >= low and top >= low and right <= high and bottom <= high:
            break
    draw.text((x, y), char, font=font, fill=PARCHMENT_INK)
    return Image.alpha_composite(tile, text)


def render_gap() -> Image.Image:
    return Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))


# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------


def render_all() -> dict[str, Image.Image]:
    images: dict[str, Image.Image] = {}
    for icon in tile_icons():
        images[icon.name] = render_tile_icon(icon)
    for line in LINE_ICONS:
        images[line.name] = render_line_icon(line)
    for suffix, char in LETTER_TILES.items():
        images[f"tile_{suffix}"] = render_letter_tile(char)
    images["tile_gap"] = render_gap()
    return images


def _png_bytes(image: Image.Image) -> bytes:
    buffer = io.BytesIO()
    image.save(buffer, format="PNG", optimize=True)
    return buffer.getvalue()


def notice_text() -> str:
    glyph_rows = sorted(
        {(icon.name, icon.glyph) for icon in tile_icons()} | {(line.name, line.glyph) for line in LINE_ICONS}
    )
    lines = [
        "# Raid bot emoji art — credits",
        "",
        "Generated by `backend/scripts/generate_discord_emojis.py`. Do not edit the",
        "PNGs by hand; change the script and re-run it.",
        "",
        "## Glyphs — game-icons.net, CC BY 3.0",
        "",
        "Icons from <https://game-icons.net>, licensed under",
        "[CC BY 3.0](https://creativecommons.org/licenses/by/3.0/). Modified:",
        "recolored, resized and composited onto colored tiles.",
        "",
        "| Emoji | Icon | Author |",
        "|---|---|---|",
    ]
    lines += [f"| `{name}` | {glyph.slug} | {glyph.author} |" for name, glyph in glyph_rows]
    lines += [
        "",
        "## Letter tiles — Cinzel",
        "",
        "`tile_*` letters are drawn with Cinzel by Natanael Gama, licensed under the",
        "[SIL Open Font License 1.1](https://openfontlicense.org). The font itself",
        "is not redistributed.",
        "",
    ]
    return "\n".join(lines)


def contact_sheet(images: dict[str, Image.Image], *, background: str = "#2b2d31") -> Image.Image:
    names = sorted(images)
    columns = 12
    cell = 150
    rows = (len(names) + columns - 1) // columns
    sheet = Image.new("RGBA", (columns * cell, rows * cell), background)
    draw = ImageDraw.Draw(sheet)
    for index, name in enumerate(names):
        x, y = (index % columns) * cell, (index // columns) * cell
        sheet.alpha_composite(images[name], (x + 11, y + 2))
        draw.text((x + 4, y + 132), name[:24], fill="#dbdee1")
    return sheet


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--sheet", type=Path, help="also write a preview contact sheet here")
    args = parser.parse_args(argv)

    images = render_all()
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    written = 0
    for name, image in sorted(images.items()):
        target = OUT_DIR / f"{name}.png"
        data = _png_bytes(image)
        if target.exists() and target.read_bytes() == data:
            continue
        target.write_bytes(data)
        written += 1
    stale = sorted(path.name for path in OUT_DIR.glob("*.png") if path.stem not in images)
    for name in stale:
        (OUT_DIR / name).unlink()
    (OUT_DIR / "NOTICE.md").write_text(notice_text(), encoding="utf-8", newline="\n")
    print(f"{len(images)} emoji images: {written} written, {len(images) - written} unchanged, {len(stale)} removed")

    if args.sheet:
        contact_sheet(images).save(args.sheet)
        print(f"Contact sheet: {args.sheet}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
