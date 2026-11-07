"""Stitch a zone's satellite image from the continent's minimap tiles.

The output covers exactly the zone map's 0..100 frame (``grid.zone_crop``),
so a marker at map percent (x, y) sits on the same ground in both pictures.
Cells with no minimap texture (open sea past the coast) are painted
``SEA_RGB``, the colour the client's own sea tiles have.
"""
from __future__ import annotations

import io
from typing import Final

from PIL import Image  # generator-only dependency (Pillow, via qrcode[pil])

from scripts.wow_satellite.crop import Crop
from scripts.wow_satellite.grid import tiles_covering, zone_crop
from scripts.wow_satellite.tile_source import TileSource
from scripts.wow_world_map.coords import ZoneBounds

# The client's minimap textures are 512px squares (one per ADT).
SOURCE_TILE_PX: Final = 512
# Twice the zone art (1002x668): sharp up to 2x zoom, still detailed at 4x,
# and 100-400 KB a zone as WebP.
OUT_WIDTH: Final = 2004
OUT_HEIGHT: Final = 1336
WEBP_QUALITY: Final = 72
SEA_RGB: Final = (4, 7, 9)
# Tiles are shrunk before stitching to this multiple of the final scale, so a
# large zone never builds a full-resolution canvas (memory) yet the last
# resize still has pixels to average (quality).
SUPERSAMPLE: Final = 2.0


def _work_tile_px(crop: Crop) -> int:
    """Tile size to stitch at: the final scale x ``SUPERSAMPLE``, never above the source."""
    scale = max(OUT_WIDTH / crop.width, OUT_HEIGHT / crop.height)
    return max(16, min(SOURCE_TILE_PX, round(SOURCE_TILE_PX * scale * SUPERSAMPLE)))


def render_zone(
    bounds: ZoneBounds,
    minimaps: dict[tuple[int, int], int],
    fetch: TileSource,
) -> Image.Image | None:
    """The zone's satellite image (``OUT_WIDTH`` x ``OUT_HEIGHT``, RGB), or None with no minimap under it."""
    native = zone_crop(bounds, SOURCE_TILE_PX)
    cells = tiles_covering(native, SOURCE_TILE_PX)
    present = [c for c in cells if c in minimaps]
    if not present:
        return None
    work = _work_tile_px(native)
    first_col = min(c for c, _ in cells)
    first_row = min(r for _, r in cells)
    cols = max(c for c, _ in cells) - first_col + 1
    rows = max(r for _, r in cells) - first_row + 1
    canvas = Image.new("RGB", (cols * work, rows * work), SEA_RGB)
    for col, row in present:
        tile = Image.open(io.BytesIO(fetch(minimaps[(col, row)]))).convert("RGB")
        if tile.size != (work, work):
            tile = tile.resize((work, work), Image.Resampling.LANCZOS)
        canvas.paste(tile, ((col - first_col) * work, (row - first_row) * work))
    crop = zone_crop(bounds, work)
    box = (
        crop.left - first_col * work,
        crop.top - first_row * work,
        crop.right - first_col * work,
        crop.bottom - first_row * work,
    )
    return canvas.resize((OUT_WIDTH, OUT_HEIGHT), Image.Resampling.LANCZOS, box=box)


def to_webp(image: Image.Image) -> bytes:
    out = io.BytesIO()
    image.save(out, "WEBP", quality=WEBP_QUALITY, method=6)
    return out.getvalue()
