"""Unit tests for css_contrast.py — the parser and colour maths behind test_css_color_contrast.py."""
from __future__ import annotations

import pytest

from tests.css_contrast import (
    composite,
    contrast_ratio,
    hsl_to_rgb,
    parse_block_tokens,
    quantize,
    unwrap_hsl,
)

_WHITE = (1.0, 1.0, 1.0)
_BLACK = (0.0, 0.0, 0.0)


def test_missing_root_raises() -> None:
    with pytest.raises(ValueError, match=":root"):
        parse_block_tokens(".dark { --primary: 0 0% 0%; }", ":root")


def test_commented_out_declaration_is_ignored() -> None:
    css = ":root { /* --primary: 0 0% 0%; */ --primary: 221.2 83.2% 51%; }"
    assert parse_block_tokens(css, ":root") == {"primary": "221.2 83.2% 51%"}


def test_commented_out_block_is_ignored() -> None:
    css = "/* :root { --primary: 0 0% 0%; } */ :root { --primary: 10 10% 10%; }"
    assert parse_block_tokens(css, ":root") == {"primary": "10 10% 10%"}


def test_var_value_is_unparseable() -> None:
    tokens = parse_block_tokens(":root { --primary: var(--brand); }", ":root")
    with pytest.raises(ValueError, match="var"):
        hsl_to_rgb(tokens["primary"])


def test_hue_with_deg_unit_parses() -> None:
    assert hsl_to_rgb("221.2deg 83.2% 51%") == hsl_to_rgb("221.2 83.2% 51%")


def test_selector_does_not_match_descendant_or_compound() -> None:
    css = ".dark * { --x: 1 1% 1%; } .dark { --y: 2 2% 2%; }"
    assert parse_block_tokens(css, ".dark") == {"y": "2 2% 2%"}


def test_unwrap_hsl() -> None:
    assert unwrap_hsl("hsl(221.2 83.2% 51%)") == "221.2 83.2% 51%"
    assert unwrap_hsl("221.2 83.2% 51%") == "221.2 83.2% 51%"


def test_known_contrast_ratios() -> None:
    assert contrast_ratio(_WHITE, _BLACK) == pytest.approx(21, abs=1e-9)
    assert contrast_ratio(_WHITE, _WHITE) == pytest.approx(1, abs=1e-9)
    grey = quantize(hsl_to_rgb("0 0% 46.7%"))  # #777777
    assert contrast_ratio(grey, _WHITE) == pytest.approx(4.48, abs=0.01)


def test_composite_half_black_over_white_is_mid_grey() -> None:
    assert composite(_BLACK, 0.5, _WHITE) == pytest.approx((128 / 255,) * 3)
