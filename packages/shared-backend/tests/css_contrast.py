"""WCAG contrast maths and `:root` token parsing for the CSS contrast conformance test. Not a test module.

Used by test_css_color_contrast.py. Colours are shadcn-style bare HSL triples
(`221.2 83.2% 51%`), the form every app's index.css declares under `:root` and `.dark`.
"""

from __future__ import annotations

import re

from tests.rgb import Rgb

_COMMENT = re.compile(r"/\*.*?\*/", re.S)
_HSL_TRIPLE = re.compile(
    r"^(?P<h>-?\d+(?:\.\d+)?)(?:deg)?\s+(?P<s>\d+(?:\.\d+)?)%\s+(?P<l>\d+(?:\.\d+)?)%$"
)
_HSL_WRAPPER = re.compile(r"^hsl\(\s*(?P<inner>[^)]*?)\s*\)$")


def parse_block_tokens(css: str, selector: str) -> dict[str, str]:
    """Return the `--name: value` declarations of the first top-level `selector { ... }` block.

    CSS comments are stripped first so a commented-out declaration cannot shadow the real one.
    Names are returned without the leading `--`. Raises ValueError if the block is absent.
    """
    stripped = _COMMENT.sub("", css)
    block = re.search(rf"(?<![\w.-]){re.escape(selector)}\s*\{{(?P<body>[^}}]*)\}}", stripped)
    if block is None:
        raise ValueError(f"no {selector} block found")
    return {
        name: value.strip()
        for name, value in re.findall(r"--([\w-]+)\s*:\s*([^;]+);", block.group("body"))
    }


def unwrap_hsl(value: str) -> str:
    """Turn `hsl(H S% L%)` into the bare `H S% L%` triple; bare triples pass through unchanged."""
    wrapped = _HSL_WRAPPER.match(value.strip())
    return wrapped["inner"] if wrapped else value.strip()


def hsl_to_rgb(value: str) -> Rgb:
    """Convert `H S% L%` to sRGB channels in 0..1. Raises ValueError if unparseable."""
    match = _HSL_TRIPLE.match(value.strip())
    if match is None:
        raise ValueError(f"not an 'H S% L%' triple: {value!r}")
    hue = float(match["h"]) % 360 / 60
    sat = float(match["s"]) / 100
    light = float(match["l"]) / 100
    chroma = (1 - abs(2 * light - 1)) * sat
    mid = chroma * (1 - abs(hue % 2 - 1))
    base = light - chroma / 2
    sector = int(hue)
    r, g, b = [(chroma, mid, 0), (mid, chroma, 0), (0, chroma, mid),
               (0, mid, chroma), (mid, 0, chroma), (chroma, 0, mid)][sector]
    return (r + base, g + base, b + base)


def quantize(color: Rgb) -> Rgb:
    """Round each channel to the 8-bit value a browser actually paints."""
    r, g, b = (round(c * 255) / 255 for c in color)
    return (r, g, b)


def composite(foreground: Rgb, alpha: float, backdrop: Rgb) -> Rgb:
    """Alpha-composite `foreground` at `alpha` over an opaque `backdrop`, as painted (8-bit channels)."""
    r, g, b = (f * alpha + k * (1 - alpha) for f, k in zip(quantize(foreground), quantize(backdrop)))
    return quantize((r, g, b))


def relative_luminance(color: Rgb) -> float:
    r, g, b = (c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4 for c in color)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast_ratio(first: Rgb, second: Rgb) -> float:
    lighter, darker = sorted((relative_luminance(first), relative_luminance(second)), reverse=True)
    return (lighter + 0.05) / (darker + 0.05)
