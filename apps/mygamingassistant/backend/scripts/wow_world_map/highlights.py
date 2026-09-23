"""Hover highlights + hit-test masks from the client's map highlight art.

Each zone (and each continent) has a highlight texture (``UiMapArt.
HighlightFileDataID``): the glow the game draws over the zone's shape when
you hover it on the parent map. It is additive art — black where the zone
isn't, a soft glow where it is — and its used area is the top ``width x
width/1.5`` of the texture (the texture's width spans the zone map's width;
every map is 3:2), stretched over the zone map's world rectangle drawn on
the parent. So the texture, sampled in the zone map's own 0..1 frame, is the
zone's outline — the shape the game hit-tests when you click the parent map.

Two outputs per map that has one:

* ``public/wow-maps/highlight/<uiMapId>.webp`` — white with the glow as
  alpha, so the page can tint it (friendly / hostile / contested) with a CSS
  mask.
* a ``MASK_W x MASK_H`` bit mask (``mapMasks.json``) the page's hit-test
  samples: a world point belongs to a zone only where the zone's glow is.

Cities and the island maps ship no highlight; the page hit-tests and
outlines their rectangle instead.
"""
from __future__ import annotations

import base64
import io
from pathlib import Path
from typing import TYPE_CHECKING

from scripts.wow_world_map import sources

if TYPE_CHECKING:
    from PIL.Image import Image

# Mask resolution in the zone map's frame (3:2 like every map); ~30 yards a
# cell on a typical zone.
MASK_W = 120
MASK_H = 80
# A cell is inside the zone where the glow is at least this share of the
# texture's brightest pixel. The glow fades out just inside the painted zone
# border, so a low cut keeps the gap between neighbours to that border line;
# where two faint edges still overlap, the smaller zone wins (the page's
# hit-test rule).
MASK_THRESHOLD = 0.06
# Highlight images are shown at most ~200 px wide on the parent map.
HIGHLIGHT_MAX_WIDTH = 256
MAP_ASPECT = 1.5


def pack_mask(bits: list[bool]) -> str:
    """Row-major bits, most significant bit first, base64."""
    out = bytearray((len(bits) + 7) // 8)
    for i, bit in enumerate(bits):
        if bit:
            out[i // 8] |= 0x80 >> (i % 8)
    return base64.b64encode(bytes(out)).decode("ascii")


def mask_covers(mask: str, x_pct: float, y_pct: float) -> bool:
    """True when the packed mask is set at map percent ``(x, y)``."""
    if not (0 <= x_pct <= 100 and 0 <= y_pct <= 100):
        return False
    col = min(MASK_W - 1, int(x_pct / 100 * MASK_W))
    row = min(MASK_H - 1, int(y_pct / 100 * MASK_H))
    i = row * MASK_W + col
    return bool(base64.b64decode(mask)[i // 8] & (0x80 >> (i % 8)))


class MapHighlights:
    """Loads each map's highlight texture once; renders images and masks."""

    def __init__(self) -> None:
        art_for_map = {
            int(r["UiMapID"]): int(r["UiMapArtID"]) for r in sources.wago_table("UiMapXMapArt")
        }
        highlight_for_art = {
            int(r["ID"]): int(r["HighlightFileDataID"]) for r in sources.wago_table("UiMapArt")
        }
        self._file_for_map = {
            ui_map: highlight_for_art[art]
            for ui_map, art in art_for_map.items()
            if highlight_for_art.get(art)
        }
        self._glow: dict[int, "Image"] = {}

    def has(self, ui_map_id: int) -> bool:
        return ui_map_id in self._file_for_map

    def glow(self, ui_map_id: int) -> "Image":
        """The used 3:2 area of the texture as brightness 0..255 (``L``)."""
        if ui_map_id in self._glow:
            return self._glow[ui_map_id]
        from PIL import Image  # generator-only dependency (Pillow, via qrcode[pil])

        texture = Image.open(io.BytesIO(sources.wago_file(self._file_for_map[ui_map_id])))
        texture = texture.convert("RGB").convert("L")
        used_height = texture.width / MAP_ASPECT
        used = texture.resize(
            (texture.width, round(used_height)),
            Image.Resampling.BILINEAR,
            box=(0, 0, texture.width, used_height),
        )
        peak = max(used.getextrema()[1], 1)
        used = used.point(lambda v: min(255, round(v * 255 / peak)))
        self._glow[ui_map_id] = used
        return used

    def mask(self, ui_map_id: int) -> str:
        from PIL import Image

        small = self.glow(ui_map_id).resize((MASK_W, MASK_H), Image.Resampling.BOX)
        cut = MASK_THRESHOLD * 255
        return pack_mask([small.getpixel((x, y)) >= cut for y in range(MASK_H) for x in range(MASK_W)])  # type: ignore[operator]

    def render(self, ui_map_id: int, out_dir: Path) -> None:
        """Write ``<out_dir>/<uiMapId>.webp``: white, the glow as alpha."""
        from PIL import Image

        glow = self.glow(ui_map_id)
        if glow.width > HIGHLIGHT_MAX_WIDTH:
            glow = glow.resize(
                (HIGHLIGHT_MAX_WIDTH, round(HIGHLIGHT_MAX_WIDTH / MAP_ASPECT)), Image.Resampling.LANCZOS
            )
        # Square-root curve: the soft glow reads as a filled zone once tinted.
        alpha = glow.point(lambda v: round(255 * (v / 255) ** 0.5))
        image = Image.new("RGBA", glow.size, (255, 255, 255, 0))
        image.putalpha(alpha)
        out_dir.mkdir(parents=True, exist_ok=True)
        image.save(out_dir / f"{ui_map_id}.webp", "WEBP", lossless=True, method=6)
