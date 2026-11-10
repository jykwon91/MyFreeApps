"""Pixel-level helpers for `image_processor`: ICC normalisation and alpha flattening."""
from __future__ import annotations

import io

from PIL import Image, ImageCms

_SRGB = ImageCms.createProfile("sRGB")
_WHITE = (255, 255, 255)


def to_srgb(image: Image.Image, icc_profile: bytes | None) -> None:
    """Convert `image` in place from its embedded ICC profile to sRGB.

    Phones tag photos Display P3; the output is stored untagged, so without the
    conversion browsers would read the P3 values as sRGB and show washed-out
    colours. Does nothing for images without a profile, with an sRGB profile, or
    in a mode the transform doesn't cover; a profile Pillow cannot use is skipped
    (the photo is kept, untagged).
    """
    if not icc_profile or image.mode not in ("RGB", "RGBA"):
        return
    try:
        source = ImageCms.ImageCmsProfile(io.BytesIO(icc_profile))
        if "srgb" in ImageCms.getProfileDescription(source).lower():
            return
        ImageCms.profileToProfile(image, source, _SRGB, inPlace=True)
    except (ImageCms.PyCMSError, OSError):
        return


def flatten_alpha(image: Image.Image) -> Image.Image:
    """Return `image` as RGB, compositing any transparency onto white.

    A bare ``convert("RGB")`` would drop the alpha channel and leave transparent
    pixels as whatever colour they were hiding (often black).
    """
    has_alpha = image.mode in ("RGBA", "LA", "PA") or (
        image.mode == "P" and "transparency" in image.info
    )
    if not has_alpha:
        return image if image.mode in ("RGB", "L", "CMYK") else image.convert("RGB")
    rgba = image.convert("RGBA")
    flat = Image.new("RGB", rgba.size, _WHITE)
    flat.paste(rgba, mask=rgba.getchannel("A"))
    return flat
