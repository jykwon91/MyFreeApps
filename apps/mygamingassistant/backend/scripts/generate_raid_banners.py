"""Generate the raid posts' banner art -> backend/data/raid_banners/.

Our own art, never Blizzard's or Raid-Helper's: per raid, a gradient between
two accent colors, a game-icons.net glyph (CC BY 3.0, credited per banner in
NOTICE.md) as an emblem on the right, and the raid's name and size in Cinzel
Black (SIL OFL 1.1) on the left.  The motifs and accents come from the raid
domain review (see ``BANNERS``); the names and sizes from the raid catalog.

1200 x 300 — 4:1, the shape Discord shows whole under a post on desktop and
on phones (about 400 px wide, where the name still reads).  The name's side
of the gradient is darkened as far as AAA contrast with the lettering needs.

Every PNG's file stem is a raid key (``RAIDS`` in
``app/services/wow/raid_catalog.py``); ``app/services/wow/raid_banners.py``
serves them and shows each raid's on its posts.

Run from apps/mygamingassistant/backend:

    python scripts/generate_raid_banners.py
    python scripts/generate_raid_banners.py --sheet sheet.png   # + preview

Output is byte-stable for the same inputs and Pillow version, so a re-run
without art changes leaves git clean.
"""
from __future__ import annotations

import argparse
import sys
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

from discord_art import Glyph, colorize, contrast, fit, load_font, load_glyph, luminance, mix, rgb, write_pngs

BACKEND_DIR = Path(__file__).resolve().parents[1]
OUT_DIR = BACKEND_DIR / "data" / "raid_banners"

sys.path.insert(0, str(BACKEND_DIR))
from app.services.wow.raid_catalog import RAIDS, RaidInfo  # noqa: E402

WIDTH, HEIGHT = 1200, 300
PAD = 64
EMBLEM_BOX = 250
EMBLEM_GAP = 40  # between the name and the emblem

LETTERING = rgb("#efe4cc")  # parchment, like the title tiles
BLACK = (0, 0, 0)
WHITE = (255, 255, 255)
NAME_CONTRAST = 7.0  # WCAG AAA, lettering vs the gradient under the name
EMBLEM_SIDE_CONTRAST = 3.0  # keeps the emblem's end dark enough for the light glyph

NAME_SIZES = range(96, 39, -2)
SUBTITLE_SIZE = 34


@dataclass(frozen=True)
class BannerArt:
    accents: tuple[str, str]  # the gradient: name side -> emblem side
    glyph: Glyph


# Raid key -> art.  Every RAIDS key has one; the motif each evokes is noted.
BANNERS = {
    "barrow_deeps": BannerArt(("#3E2F6B", "#6F9E4C"), Glyph("lorc", "manacles")),  # sealed barrow prison
    "hyjal_summit": BannerArt(("#1D3557", "#8CD867"), Glyph("lorc", "mountains")),  # elven ruins, fel sky
    "onyxia": BannerArt(("#1B1A1F", "#E4572E"), Glyph("lorc", "dragon-head")),  # brood mother's cavern
    "mc": BannerArt(("#5C1A0B", "#FFB000"), Glyph("lorc", "volcano")),  # heart of magma
    "bwl": BannerArt(("#141414", "#B3001B"), Glyph("lorc", "round-bottom-flask")),  # chromatic laboratory
    "zg": BannerArt(("#1E5631", "#9B111E"), Glyph("lorc", "snake")),  # blood god's jungle
    "aq20": BannerArt(("#C2A15A", "#2E8B8B"), Glyph("lorc", "scarab-beetle")),  # sand-buried ruins
    "aq40": BannerArt(("#D4AF37", "#4B1F6F"), Glyph("lorc", "tentacle-strike")),  # old god's temple
    "naxx": BannerArt(("#5BE37D", "#8FB8DE"), Glyph("lorc", "tombstone")),  # floating necropolis
}


# ---------------------------------------------------------------------------
# Drawing
# ---------------------------------------------------------------------------


def _darkened(color: tuple[int, int, int], target: float) -> tuple[int, int, int]:
    """``color``, darkened just enough for ``target`` contrast with the lettering."""
    lettering = luminance(LETTERING)
    for step in range(101):
        shade = mix(color, BLACK, step / 100)
        if contrast(luminance(shade), lettering) >= target:
            return shade
    return BLACK


def _background(art: BannerArt) -> Image.Image:
    """The accents blended left to right, with the top and bottom edges shaded."""
    left = _darkened(rgb(art.accents[0]), NAME_CONTRAST)
    right = _darkened(rgb(art.accents[1]), EMBLEM_SIDE_CONTRAST)
    row = Image.new("RGB", (WIDTH, 1))
    pixels = row.load()
    for x in range(WIDTH):
        t = x / (WIDTH - 1)
        pixels[x, 0] = mix(left, right, t * t * (3 - 2 * t))  # smoothstep
    image = row.resize((WIDTH, HEIGHT)).convert("RGBA")

    column = Image.new("L", (1, HEIGHT))
    shades = column.load()
    for y in range(HEIGHT):
        shades[0, y] = round(120 * (abs(y - HEIGHT / 2) / (HEIGHT / 2)) ** 2.4)
    shade = Image.new("RGBA", (WIDTH, HEIGHT), (*BLACK, 255))
    shade.putalpha(column.resize((WIDTH, HEIGHT)))
    return Image.alpha_composite(image, shade)


def _emblem(art: BannerArt) -> Image.Image:
    """The glyph on the right, a light tint of the emblem-side accent, softly glowing."""
    glyph = fit(load_glyph(art.glyph), EMBLEM_BOX)
    tint = mix(rgb(art.accents[1]), WHITE, 0.55)
    position = (WIDTH - PAD - glyph.width, (HEIGHT - glyph.height) // 2)

    glow = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    halo = colorize(glyph, (*tint, 120))
    glow.paste(halo, position, halo)
    glow = glow.filter(ImageFilter.GaussianBlur(22))

    layer = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    ink = colorize(glyph, (*tint, 215))
    layer.paste(ink, position, ink)
    return Image.alpha_composite(glow, layer)


def subtitle(raid: RaidInfo) -> str:
    """'40-PLAYER RAID', and '· CLASSIC' for the Classic-era raids."""
    text = f"{raid.default_size}-PLAYER RAID"
    if raid.era == "classic":
        text += " · CLASSIC"
    return text


def _lettering(raid: RaidInfo) -> Image.Image:
    """The name at the largest size that fits beside the emblem, a rule, then the size."""
    layer = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    name = raid.name.upper()
    room = WIDTH - 2 * PAD - EMBLEM_BOX - EMBLEM_GAP
    for size in NAME_SIZES:
        font = load_font(size)
        left, _, right, _ = draw.textbbox((0, 0), name, font=font)
        if right - left <= room:
            break
    small = load_font(SUBTITLE_SIZE)
    sub = subtitle(raid)

    # Center the block (name caps, rule, subtitle caps) on the cap heights.
    _, cap_top, _, cap_bottom = draw.textbbox((0, 0), "H", font=font)
    _, sub_top, _, sub_bottom = draw.textbbox((0, 0), "H", font=small)
    to_rule, to_subtitle = 26, 24
    top = (HEIGHT - (cap_bottom - cap_top) - to_rule - to_subtitle - (sub_bottom - sub_top)) / 2
    name_xy = (PAD, top - cap_top)
    rule_y = top + (cap_bottom - cap_top) + to_rule
    sub_xy = (PAD, rule_y + to_subtitle - sub_top)

    shadow = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    shadow_draw = ImageDraw.Draw(shadow)
    shadow_draw.text((name_xy[0] + 3, name_xy[1] + 4), name, font=font, fill=(*BLACK, 210))
    shadow_draw.text((sub_xy[0] + 2, sub_xy[1] + 3), sub, font=small, fill=(*BLACK, 190))
    shadow = shadow.filter(ImageFilter.GaussianBlur(4))

    draw.text(name_xy, name, font=font, fill=(*LETTERING, 255))
    draw.line((PAD, rule_y, PAD + 140, rule_y), fill=(*LETTERING, 210), width=4)
    draw.text(sub_xy, sub, font=small, fill=(*LETTERING, 235))
    return Image.alpha_composite(shadow, layer)


def render_banner(raid: RaidInfo) -> Image.Image:
    art = BANNERS[raid.key]
    image = _background(art)
    image = Image.alpha_composite(image, _emblem(art))
    image = Image.alpha_composite(image, _lettering(raid))
    ImageDraw.Draw(image).rectangle((7, 7, WIDTH - 8, HEIGHT - 8), outline=(*LETTERING, 60), width=2)
    return image.convert("RGB")


# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------


def _check_catalog() -> None:
    keys = [raid.key for raid in RAIDS]
    missing = [key for key in keys if key not in BANNERS]
    unknown = sorted(set(BANNERS) - set(keys))
    if missing or unknown:
        raise SystemExit(f"BANNERS must cover exactly the catalog's raids: missing {missing}, unknown {unknown}")


def notice_text() -> str:
    lines = [
        "# Raid banner art — credits",
        "",
        "Generated by `backend/scripts/generate_raid_banners.py`. Do not edit the",
        "PNGs by hand; change the script and re-run it.",
        "",
        "## Glyphs — game-icons.net, CC BY 3.0",
        "",
        "Icons from <https://game-icons.net>, licensed under",
        "[CC BY 3.0](https://creativecommons.org/licenses/by/3.0/). Modified:",
        "recolored, resized and composited onto gradient banners.",
        "",
        "| Banner | Icon | Author |",
        "|---|---|---|",
    ]
    lines += [f"| `{key}` | {art.glyph.slug} | {art.glyph.author} |" for key, art in sorted(BANNERS.items())]
    lines += [
        "",
        "## Lettering — Cinzel",
        "",
        "Raid names are drawn with Cinzel by Natanael Gama, licensed under the",
        "[SIL Open Font License 1.1](https://openfontlicense.org). The font itself",
        "is not redistributed.",
        "",
    ]
    return "\n".join(lines)


def contact_sheet(images: dict[str, Image.Image], *, background: str = "#2b2d31") -> Image.Image:
    """The banners stacked at half size, in catalog order."""
    gap = 10
    tiles = [images[raid.key].resize((WIDTH // 2, HEIGHT // 2), Image.Resampling.LANCZOS) for raid in RAIDS]
    sheet = Image.new("RGB", (WIDTH // 2, len(tiles) * (HEIGHT // 2 + gap) - gap), background)
    for index, tile in enumerate(tiles):
        sheet.paste(tile, (0, index * (HEIGHT // 2 + gap)))
    return sheet


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--sheet", type=Path, help="also write a preview contact sheet here")
    args = parser.parse_args(argv)

    _check_catalog()
    images = {raid.key: render_banner(raid) for raid in RAIDS}
    written, removed = write_pngs(OUT_DIR, images)
    (OUT_DIR / "NOTICE.md").write_text(notice_text(), encoding="utf-8", newline="\n")
    print(f"{len(images)} raid banners: {written} written, {len(images) - written} unchanged, {removed} removed")

    if args.sheet:
        contact_sheet(images).save(args.sheet)
        print(f"Contact sheet: {args.sheet}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
