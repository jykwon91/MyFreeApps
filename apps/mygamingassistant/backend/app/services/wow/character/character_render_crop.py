"""Crop Blizzard's 1600x1200 render to the character, whatever their size.

The render is a transparent PNG with the figure small near the bottom middle
(a gnome fills a fraction of what a tauren does), so the crop follows the
opaque pixels rather than a fixed box.
"""
from io import BytesIO

from PIL import Image, UnidentifiedImageError

from app.core.wow_character import CHARACTER_RENDER_PADDING
from app.services.wow.character.character_lookup_error import CharacterLookupError


def crop_render(png: bytes) -> bytes:
    try:
        with Image.open(BytesIO(png)) as source:
            image = source.convert("RGBA")
    except (UnidentifiedImageError, OSError) as exc:
        raise CharacterLookupError("render is not an image", status_code=200) from exc
    box = image.getchannel("A").getbbox()
    if box is None:
        raise CharacterLookupError("render is empty", status_code=200)
    left, top, right, bottom = box
    pad = round(max(right - left, bottom - top) * CHARACTER_RENDER_PADDING)
    cropped = image.crop((
        max(left - pad, 0),
        max(top - pad, 0),
        min(right + pad, image.width),
        min(bottom + pad, image.height),
    ))
    out = BytesIO()
    cropped.save(out, format="PNG", optimize=True)
    return out.getvalue()
