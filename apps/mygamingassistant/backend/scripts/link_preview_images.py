"""Generate the link-preview cards (Open Graph / Twitter images) for MGA's pages.

    python -m scripts.link_preview_images   # from apps/mygamingassistant/backend

Writes 1200x630 PNGs to ``frontend/public/link-preview/``:

- ``wow-forever.png`` — every WoW Forever page: our World Map art of Azeroth
  (``public/wow-maps/947.webp``) behind the title, with a row of in-game icons
  from the icon pipeline (``scripts.wow_icons``: the pinned Forever client's
  BLP files, read through the same download cache).
- ``mygamingassistant.png`` — the site root: our Valorant and CS2 minimaps
  (``public/minimaps/``) and the Azeroth map art beside the title.

The pages that use them are listed in
``frontend/src/constants/linkPreview.ts``. Text is set in Inter (SIL OFL 1.1,
downloaded from google/fonts and cached), in the app's dark theme colours. The
output is byte-stable for the same inputs and Pillow version, and an unchanged
image isn't rewritten. Each PNG must stay under ``MAX_BYTES`` (Discord and
other unfurlers drop large images); the script stops if one doesn't.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Final

from PIL import Image, ImageDraw, ImageFilter, ImageFont

from scripts.discord_art import CACHE_DIR, download, png_bytes, rgb
from scripts.wow_icons.images import open_blp
from scripts.wow_world_map.walk.client_files import client_file

FRONTEND_DIR: Final = Path(__file__).resolve().parents[2] / "frontend"
OUT_DIR: Final = FRONTEND_DIR / "public" / "link-preview"
WOW_MAP_ART: Final = FRONTEND_DIR / "public" / "wow-maps" / "947.webp"
MINIMAPS_DIR: Final = FRONTEND_DIR / "public" / "minimaps"

WIDTH: Final = 1200
HEIGHT: Final = 630
MAX_BYTES: Final = 300 * 1024
PADDING: Final = 64

FONT_URL: Final = "https://raw.githubusercontent.com/google/fonts/main/ofl/inter/Inter%5Bopsz,wght%5D.ttf"
FONT_OPTICAL_SIZE: Final = 32

# The app's dark theme (frontend/src/index.css): background 222.2 84% 4.9%, primary 217.2 91.2% 59.8%.
BACKGROUND: Final = rgb("#020817")
PRIMARY: Final = rgb("#3b82f6")
TEXT: Final = rgb("#f8fafc")
MUTED: Final = rgb("#cbd5e1")
SUBTLE: Final = rgb("#94a3b8")
CARD_BORDER: Final = rgb("#1e293b")

SITE_HOST: Final = "mygamingassistant.myfreeapps.org"

# Item quality ring colours, as GameIcon draws them.
QUALITY_COLORS: Final = {2: rgb("#1eff00"), 3: rgb("#0070dd"), 4: rgb("#a335ee"), 5: rgb("#ff8000")}


@dataclass(frozen=True)
class CardIcon:
    """An in-game icon on the card: its client file id (``wowIcons.json``) and quality colour."""

    file_id: int
    quality: int


# Recognisable items from the pages' own icon map (``wowIcons.json``): Arcanite Reaper, Thunderfury,
# Black Lotus, Copper Ore, Linen Cloth, Essence of Fire, Elementium Ore.
WOW_ICONS: Final = (
    CardIcon(132400, 3),
    CardIcon(135349, 5),
    CardIcon(134202, 2),
    CardIcon(134566, 2),
    CardIcon(132889, 2),
    CardIcon(135830, 2),
    CardIcon(133235, 5),
)
ICON_SIZE: Final = 76
ICON_GAP: Final = 18

WOW_FEATURE_LINES: Final = (
    "World map · Dungeons · Rares · Professions",
    "Talents · Best gear · Auction house · Macros",
)
LINEUP_MAPS: Final = (("valorant", "haven"), ("cs2", "mirage"))


def font(size: int, weight: int) -> ImageFont.FreeTypeFont:
    path = CACHE_DIR / "Inter-opsz-wght.ttf"
    download(FONT_URL, path)
    face = ImageFont.truetype(str(path), size)
    face.set_variation_by_axes([FONT_OPTICAL_SIZE, weight])
    return face


def cover(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    """``image`` scaled to fill ``size``, centred and cropped."""
    scale = max(size[0] / image.width, size[1] / image.height)
    scaled = image.resize((round(image.width * scale), round(image.height * scale)), Image.Resampling.LANCZOS)
    left = (scaled.width - size[0]) // 2
    top = (scaled.height - size[1]) // 2
    return scaled.crop((left, top, left + size[0], top + size[1]))


def left_shade(size: tuple[int, int], strongest: int, weakest: int) -> Image.Image:
    """A background-coloured layer fading from ``strongest`` alpha at the left edge to ``weakest`` at the right."""
    width, height = size
    alpha = Image.linear_gradient("L").rotate(90, expand=True).resize((width, height))
    alpha = alpha.point(lambda v: round(weakest + (strongest - weakest) * v / 255))
    layer = Image.new("RGBA", size, (*BACKGROUND, 255))
    layer.putalpha(alpha)
    return layer


def rounded_mask(size: tuple[int, int], radius: int) -> Image.Image:
    mask = Image.new("L", size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size[0] - 1, size[1] - 1), radius, fill=255)
    return mask


def framed_icon(icon: CardIcon) -> Image.Image:
    """An icon in a dark rounded frame ringed in its quality colour, like the pages' ``GameIcon``."""
    ring = 4
    art = open_blp(client_file(icon.file_id)).convert("RGBA")
    art = art.resize((ICON_SIZE - 2 * ring, ICON_SIZE - 2 * ring), Image.Resampling.LANCZOS)
    tile = Image.new("RGBA", (ICON_SIZE, ICON_SIZE), (0, 0, 0, 0))
    ImageDraw.Draw(tile).rounded_rectangle(
        (0, 0, ICON_SIZE - 1, ICON_SIZE - 1), 12, fill=(*BACKGROUND, 255), outline=QUALITY_COLORS[icon.quality], width=ring
    )
    tile.paste(art, (ring, ring), rounded_mask(art.size, 8))
    return tile


def drop_shadow(card: Image.Image, mask: Image.Image, blur: int) -> tuple[Image.Image, int]:
    """A soft shadow for a card shape; returns the shadow and how far it reaches past the card."""
    spread = blur * 2
    shadow = Image.new("RGBA", (card.width + 2 * spread, card.height + 2 * spread), (0, 0, 0, 0))
    alpha = Image.new("L", shadow.size, 0)
    alpha.paste(mask.point(lambda v: v * 0.7), (spread, spread))
    shadow.putalpha(alpha.filter(ImageFilter.GaussianBlur(blur)))
    return shadow, spread


def paste_card(canvas: Image.Image, card: Image.Image, at: tuple[int, int], radius: int) -> None:
    mask = rounded_mask(card.size, radius)
    shadow, spread = drop_shadow(card, mask, 14)
    canvas.alpha_composite(shadow, (at[0] - spread, at[1] - spread + 8))
    framed = card.copy()
    framed.putalpha(mask)
    canvas.alpha_composite(framed, at)
    ImageDraw.Draw(canvas).rounded_rectangle(
        (at[0], at[1], at[0] + card.width - 1, at[1] + card.height - 1), radius, outline=CARD_BORDER, width=2
    )


def draw_brand(draw: ImageDraw.ImageDraw, top: int) -> None:
    draw.rounded_rectangle((PADDING, top, PADDING + 10, top + 34), 3, fill=PRIMARY)
    draw.text((PADDING + 24, top + 17), "MyGamingAssistant", font=font(30, 600), fill=TEXT, anchor="lm")


def draw_host(draw: ImageDraw.ImageDraw) -> None:
    draw.text((PADDING, HEIGHT - PADDING), SITE_HOST, font=font(24, 500), fill=SUBTLE, anchor="ls")


def wow_forever_card() -> Image.Image:
    canvas = Image.new("RGBA", (WIDTH, HEIGHT), (*BACKGROUND, 255))
    # Softened a little: it sits behind the text, and the map's fine detail would only cost bytes.
    world = cover(Image.open(WOW_MAP_ART).convert("RGBA"), (WIDTH, HEIGHT)).filter(ImageFilter.GaussianBlur(1.5))
    canvas.alpha_composite(world)
    canvas.alpha_composite(left_shade((WIDTH, HEIGHT), 248, 110))

    draw = ImageDraw.Draw(canvas)
    draw_brand(draw, PADDING)
    draw.text((PADDING, 150), "WoW Forever", font=font(92, 800), fill=TEXT)
    draw.text((PADDING, 258), "companion", font=font(92, 800), fill=PRIMARY)
    for index, line in enumerate(WOW_FEATURE_LINES):
        draw.text((PADDING, 384 + index * 42), line, font=font(30, 500), fill=MUTED)

    icons_width = len(WOW_ICONS) * ICON_SIZE + (len(WOW_ICONS) - 1) * ICON_GAP
    icons_top = HEIGHT - PADDING - ICON_SIZE
    left = WIDTH - PADDING - icons_width
    for index, icon in enumerate(WOW_ICONS):
        canvas.alpha_composite(framed_icon(icon), (left + index * (ICON_SIZE + ICON_GAP), icons_top))

    draw_host(draw)
    return canvas


def site_card() -> Image.Image:
    canvas = Image.new("RGBA", (WIDTH, HEIGHT), (*BACKGROUND, 255))
    glow = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse((620, -260, 1500, 620), fill=(*PRIMARY, 70))
    canvas.alpha_composite(glow.filter(ImageFilter.GaussianBlur(120)))

    map_size = 300
    for index, (game, slug) in enumerate(LINEUP_MAPS):
        minimap = Image.open(MINIMAPS_DIR / game / f"{slug}.png").convert("RGBA")
        tile = Image.new("RGBA", (map_size, map_size), (*rgb("#0f172a"), 255))
        tile.alpha_composite(minimap.resize((map_size - 24, map_size - 24), Image.Resampling.LANCZOS), (12, 12))
        paste_card(canvas, tile, (WIDTH - PADDING - map_size - index * (map_size + 28), PADDING), 20)

    world = cover(Image.open(WOW_MAP_ART).convert("RGBA"), (2 * map_size + 28, 170))
    paste_card(canvas, world, (WIDTH - PADDING - (2 * map_size + 28), HEIGHT - PADDING - 170), 20)

    draw = ImageDraw.Draw(canvas)
    draw_brand(draw, PADDING)
    text_font = font(46, 800)
    draw.text((PADDING, 170), "Lineups for", font=text_font, fill=TEXT)
    draw.text((PADDING, 226), "Valorant & CS2", font=text_font, fill=PRIMARY)
    draw.text((PADDING, 312), "WoW Forever", font=text_font, fill=TEXT)
    draw.text((PADDING, 368), "companion", font=text_font, fill=PRIMARY)
    draw_host(draw)
    return canvas


def encode(image: Image.Image) -> bytes:
    """PNG bytes; a full-colour card over ``MAX_BYTES`` is quantized to a 256-colour palette."""
    rgb_image = image.convert("RGB")
    data = png_bytes(rgb_image)
    if len(data) <= MAX_BYTES:
        return data
    data = png_bytes(rgb_image.quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE))
    if len(data) > MAX_BYTES:
        raise SystemExit(f"Link preview card is {len(data)} bytes, over the {MAX_BYTES}-byte limit.")
    return data


def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    cards = {"wow-forever": wow_forever_card(), "mygamingassistant": site_card()}
    for name, image in cards.items():
        assert image.size == (WIDTH, HEIGHT)
        data = encode(image)
        target = OUT_DIR / f"{name}.png"
        if target.exists() and target.read_bytes() == data:
            print(f"unchanged {target.name} ({len(data):,} bytes)")
            continue
        target.write_bytes(data)
        print(f"wrote {target.name} ({len(data):,} bytes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
