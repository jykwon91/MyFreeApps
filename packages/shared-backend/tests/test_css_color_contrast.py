"""Colour contrast conformance — every app's themes must keep their text readable at WCAG AA.

Parses the `:root` (light) and `.dark` blocks of each app's (and the scaffold's) frontend
index.css and checks, per theme:

- every text token (body, card, muted and secondary text, text-primary links and active items,
  text-destructive errors) on every surface text sits on: --background, --card, and the shaded
  --muted / --secondary fills (chips, segmented controls, table headers, hovered rows);
- text-primary over bg-primary/10 and text-destructive over bg-destructive/10 (the active nav
  item, tinted badges, the 2FA disable button's hover tint), alpha-composited on --background;
- each solid fill's label: --primary-foreground on --primary, --destructive-foreground on
  --destructive. Dark mode can't satisfy both with near-white button text, so its --destructive
  is a light red with dark --destructive-foreground.

- --input (the border of inputs, selects, textareas, checkboxes and outline buttons) against each of
  those surfaces at the WCAG 1.4.11 non-text 3:1 minimum.

Every token a theme declares must have a role below, so a new colour can't skip the check.
Every channel is rounded to 8 bits first, so each pairing is measured as a browser paints it.
Apps are discovered from apps/*/app.yaml and each must have frontend/src/index.css (every app
today ships a web frontend; an app without one needs an explicit, reviewed exemption here).
A missing or unparseable token fails loudly rather than skipping. The landing page and
shared-mobile must carry the same light primary as the scaffold. The error message is the fix:
change the token in that file (and in infra/templates/scaffold so new apps inherit it).
"""
from __future__ import annotations

import re
from pathlib import Path

import pytest

from tests.app_index_css import APPS, CSS_FILES, REPO_ROOT, SCAFFOLD_CSS
from tests.css_contrast import (
    composite,
    contrast_ratio,
    hsl_to_rgb,
    parse_block_tokens,
    quantize,
    unwrap_hsl,
)
from tests.rgb import Rgb

_LANDING_CSS = REPO_ROOT / "sites" / "landing" / "public" / "styles.css"
_MOBILE_COLORS = REPO_ROOT / "packages" / "shared-mobile" / "src" / "theme" / "colors.ts"

# WCAG 2.x AA minimum contrast for normal-size text.
WCAG_AA_TEXT_CONTRAST = 4.5
# Tailwind `bg-primary/10` and `bg-destructive/10`.
TINT_ALPHA = 0.10
# Surfaces text is drawn on, and the tokens drawn as text on any of them.
_TEXT_SURFACES = ("background", "card", "muted", "secondary")
_TEXT_TOKENS = (
    "foreground",
    "card-foreground",
    "muted-foreground",
    "primary",
    "secondary-foreground",
    "destructive",
)
# (label, fill): a solid fill and the one token drawn on it.
_FILL_LABELS = (("primary-foreground", "primary"), ("destructive-foreground", "destructive"))
# Text tokens also drawn over their own 10% tint (`text-primary bg-primary/10`).
_TINTED_TEXT = ("primary", "destructive")
# Borders, focus rings and sizes: never text, never under text.
_NON_TEXT_TOKENS = frozenset({"border", "ring", "radius"})
# WCAG 2.x 1.4.11 minimum contrast for the boundary of a form control or outline button.
WCAG_NON_TEXT_CONTRAST = 3.0
# --input draws the border of inputs, selects, textareas, checkboxes and outline buttons, which
# can sit on any of the surfaces text does. (--border stays light: decorative card/divider edges.)
_CONTROL_BORDER = "input"
_COLOR_TOKENS = frozenset(_TEXT_SURFACES) | frozenset(_TEXT_TOKENS) | {_CONTROL_BORDER} | {
    token for pair in _FILL_LABELS for token in pair
}
# (theme, text, surface) pairs an app is known to fail, so the rest of its matrix stays checked.
# Each entry must still fail: fixing the token makes test_known_failures_still_fail ask for it
# to be removed here.
_KNOWN_FAILURES: dict[str, frozenset[tuple[str, str, str]]] = {
    # Owned by another workstream: apps/mygamingassistant is still on the pre-fix light
    # --muted-foreground (46.9%) and dark --primary (59.8%) that the other apps raised to 45% / 64%.
    "mygamingassistant": frozenset({
        ("light", "muted-foreground", "muted"),
        ("light", "muted-foreground", "secondary"),
        ("dark", "primary", "muted"),
        ("dark", "primary", "secondary"),
        # ...and the pre-fix --input (~1.2:1 light, ~1.4:1 dark) the other apps raised to slate-500.
        *(
            (theme, _CONTROL_BORDER, surface)
            for theme in ("light", "dark")
            for surface in ("background", "card", "muted", "secondary")
        ),
    }),
}
_THEME_SELECTORS = {"light": ":root", "dark": ".dark"}


def _rgb_tokens(css_path: Path, selector: str) -> dict[str, Rgb]:
    assert css_path.is_file(), f"{css_path} not found — every app.yaml app needs a web frontend index.css"
    try:
        tokens = parse_block_tokens(css_path.read_text(encoding="utf-8"), selector)
        missing = sorted(_COLOR_TOKENS - tokens.keys())
        assert not missing, f"{css_path}: {selector} is missing tokens {missing}"
        return {name: quantize(hsl_to_rgb(tokens[name])) for name in _COLOR_TOKENS}
    except ValueError as exc:
        pytest.fail(f"{css_path}: {exc}")


def _light_primary(css_path: Path) -> str:
    tokens = parse_block_tokens(css_path.read_text(encoding="utf-8"), ":root")
    assert "primary" in tokens, f"{css_path}: :root has no --primary"
    return " ".join(unwrap_hsl(tokens["primary"]).split())


def test_apps_are_discovered() -> None:
    assert SCAFFOLD_CSS.is_file(), f"scaffold index.css not found at {SCAFFOLD_CSS}"
    assert APPS, f"no apps/*/app.yaml found under {REPO_ROOT / 'apps'}"


def _text_surface_ratios(name: str, theme: str) -> dict[tuple[str, str, str], float]:
    colors = _rgb_tokens(CSS_FILES[name], _THEME_SELECTORS[theme])
    return {
        (theme, text, surface): contrast_ratio(colors[text], colors[surface])
        for text in _TEXT_TOKENS
        for surface in _TEXT_SURFACES
    }


def _control_border_ratios(name: str, theme: str) -> dict[tuple[str, str, str], float]:
    colors = _rgb_tokens(CSS_FILES[name], _THEME_SELECTORS[theme])
    return {
        (theme, _CONTROL_BORDER, surface): contrast_ratio(colors[_CONTROL_BORDER], colors[surface])
        for surface in _TEXT_SURFACES
    }


def _required_contrast(pair: tuple[str, str, str]) -> float:
    return WCAG_NON_TEXT_CONTRAST if pair[1] == _CONTROL_BORDER else WCAG_AA_TEXT_CONTRAST


@pytest.mark.parametrize("theme", sorted(_THEME_SELECTORS))
@pytest.mark.parametrize("name", sorted(CSS_FILES))
def test_every_token_has_a_role(name: str, theme: str) -> None:
    tokens = parse_block_tokens(CSS_FILES[name].read_text(encoding="utf-8"), _THEME_SELECTORS[theme])
    unassigned = sorted(tokens.keys() - _COLOR_TOKENS - _NON_TEXT_TOKENS)
    assert not unassigned, (
        f"{CSS_FILES[name]} ({theme}) declares {unassigned} with no contrast role. Add each to "
        f"_TEXT_TOKENS, _TEXT_SURFACES, _FILL_LABELS or _NON_TEXT_TOKENS in {Path(__file__).name}"
    )


@pytest.mark.parametrize("theme", sorted(_THEME_SELECTORS))
@pytest.mark.parametrize("name", sorted(CSS_FILES))
def test_text_on_every_surface_meets_aa(name: str, theme: str) -> None:
    known = _KNOWN_FAILURES.get(name, frozenset())
    failing = {
        f"{text} on {surface}": round(r, 2)
        for (_, text, surface), r in _text_surface_ratios(name, theme).items()
        if r < WCAG_AA_TEXT_CONTRAST and (theme, text, surface) not in known
    }
    assert not failing, (
        f"{name} ({theme}): text below WCAG AA ({WCAG_AA_TEXT_CONTRAST}:1): {failing}. "
        f"Adjust the text token's lightness in {CSS_FILES[name]}"
    )


@pytest.mark.parametrize("name", sorted(_KNOWN_FAILURES))
def test_known_failures_still_fail(name: str) -> None:
    ratios = {
        pair: r
        for theme in _THEME_SELECTORS
        for pair, r in {**_text_surface_ratios(name, theme), **_control_border_ratios(name, theme)}.items()
    }
    fixed = sorted(pair for pair in _KNOWN_FAILURES[name] if ratios[pair] >= _required_contrast(pair))
    assert not fixed, f"{name} now passes {fixed}: remove them from _KNOWN_FAILURES"


@pytest.mark.parametrize("theme", sorted(_THEME_SELECTORS))
@pytest.mark.parametrize("name", sorted(CSS_FILES))
def test_fills_and_tints_meet_aa(name: str, theme: str) -> None:
    colors = _rgb_tokens(CSS_FILES[name], _THEME_SELECTORS[theme])
    ratios = {
        f"{label} on {fill}": contrast_ratio(colors[label], colors[fill]) for label, fill in _FILL_LABELS
    }
    for token in _TINTED_TEXT:
        tint = composite(colors[token], TINT_ALPHA, colors["background"])
        ratios[f"text-{token} on bg-{token}/10"] = contrast_ratio(colors[token], tint)
    failing = {pair: round(r, 2) for pair, r in ratios.items() if r < WCAG_AA_TEXT_CONTRAST}
    assert not failing, (
        f"{name} ({theme}): pairings below WCAG AA ({WCAG_AA_TEXT_CONTRAST}:1): {failing}. "
        f"Adjust the token in {CSS_FILES[name]}"
    )


@pytest.mark.parametrize("theme", sorted(_THEME_SELECTORS))
@pytest.mark.parametrize("name", sorted(CSS_FILES))
def test_control_border_meets_non_text_contrast(name: str, theme: str) -> None:
    known = _KNOWN_FAILURES.get(name, frozenset())
    failing = {
        surface: round(r, 2)
        for (_, _, surface), r in _control_border_ratios(name, theme).items()
        if r < WCAG_NON_TEXT_CONTRAST and (theme, _CONTROL_BORDER, surface) not in known
    }
    assert not failing, (
        f"{name} ({theme}): --input (form-control and outline-button border) below WCAG 1.4.11 "
        f"({WCAG_NON_TEXT_CONTRAST}:1) on {failing}. Darken (light) or lighten (dark) --input in "
        f"{CSS_FILES[name]}"
    )


def test_landing_light_primary_matches_scaffold() -> None:
    assert _light_primary(_LANDING_CSS) == _light_primary(SCAFFOLD_CSS), (
        f"{_LANDING_CSS} light --primary drifted from the scaffold's"
    )


def test_mobile_light_primary_matches_scaffold() -> None:
    source = _MOBILE_COLORS.read_text(encoding="utf-8")
    light = re.search(r"lightColors[^=]*=\s*\{(?P<body>.*?)\n\};", source, re.S)
    assert light, f"{_MOBILE_COLORS}: lightColors object not found"
    primary = re.search(r'\bprimary:\s*"hsl\(([^)]*)\)"', light["body"])
    assert primary, f"{_MOBILE_COLORS}: lightColors.primary is missing or not an hsl() string"
    mobile = " ".join(primary[1].replace(",", " ").split())
    assert mobile == _light_primary(SCAFFOLD_CSS), (
        f"{_MOBILE_COLORS} lightColors.primary drifted from the scaffold's light --primary"
    )
