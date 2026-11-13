"""Colour contrast conformance — every app's themes must keep their core pairings at WCAG AA.

Parses the `:root` (light) and `.dark` blocks of each app's (and the scaffold's) frontend
index.css and checks, per theme:

- text-primary over bg-primary/10 (the active nav item and tinted-badge pairing),
  alpha-composited on --background;
- --primary-foreground on --primary (solid primary buttons);
- text-destructive on --background and on bg-destructive/10 (error text, the 2FA disable
  button's hover tint), and --destructive-foreground on --destructive (solid destructive buttons).
  Dark mode can't satisfy both with near-white button text, so its --destructive is a light red
  with dark --destructive-foreground;
- --foreground on --background (body text).

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

from tests.css_contrast import (
    composite,
    contrast_ratio,
    hsl_to_rgb,
    parse_block_tokens,
    quantize,
    unwrap_hsl,
)
from tests.rgb import Rgb

# tests/ -> shared-backend/ -> packages/ -> repo/
_REPO_ROOT = Path(__file__).resolve().parents[3]
_SCAFFOLD_CSS = _REPO_ROOT / "infra" / "templates" / "scaffold" / "frontend" / "src" / "index.css"
_LANDING_CSS = _REPO_ROOT / "sites" / "landing" / "public" / "styles.css"
_MOBILE_COLORS = _REPO_ROOT / "packages" / "shared-mobile" / "src" / "theme" / "colors.ts"
_APPS = sorted(p.parent.name for p in (_REPO_ROOT / "apps").glob("*/app.yaml"))

# WCAG 2.x AA minimum contrast for normal-size text.
WCAG_AA_TEXT_CONTRAST = 4.5
# Tailwind `bg-primary/10` and `bg-destructive/10`.
TINT_ALPHA = 0.10
_REQUIRED_TOKENS = (
    "background",
    "foreground",
    "primary",
    "primary-foreground",
    "destructive",
    "destructive-foreground",
)
_THEME_SELECTORS = {"light": ":root", "dark": ".dark"}

_CSS_FILES = {
    "scaffold": _SCAFFOLD_CSS,
    **{app: _REPO_ROOT / "apps" / app / "frontend" / "src" / "index.css" for app in _APPS},
}


def _rgb_tokens(css_path: Path, selector: str) -> dict[str, Rgb]:
    assert css_path.is_file(), f"{css_path} not found — every app.yaml app needs a web frontend index.css"
    try:
        tokens = parse_block_tokens(css_path.read_text(encoding="utf-8"), selector)
        missing = [name for name in _REQUIRED_TOKENS if name not in tokens]
        assert not missing, f"{css_path}: {selector} is missing tokens {missing}"
        return {name: quantize(hsl_to_rgb(tokens[name])) for name in _REQUIRED_TOKENS}
    except ValueError as exc:
        pytest.fail(f"{css_path}: {exc}")


def _light_primary(css_path: Path) -> str:
    tokens = parse_block_tokens(css_path.read_text(encoding="utf-8"), ":root")
    assert "primary" in tokens, f"{css_path}: :root has no --primary"
    return " ".join(unwrap_hsl(tokens["primary"]).split())


def test_apps_are_discovered() -> None:
    assert _SCAFFOLD_CSS.is_file(), f"scaffold index.css not found at {_SCAFFOLD_CSS}"
    assert _APPS, f"no apps/*/app.yaml found under {_REPO_ROOT / 'apps'}"


@pytest.mark.parametrize("theme", sorted(_THEME_SELECTORS))
@pytest.mark.parametrize("name", sorted(_CSS_FILES))
def test_theme_contrast_meets_aa(name: str, theme: str) -> None:
    colors = _rgb_tokens(_CSS_FILES[name], _THEME_SELECTORS[theme])
    primary_tint = composite(colors["primary"], TINT_ALPHA, colors["background"])
    destructive_tint = composite(colors["destructive"], TINT_ALPHA, colors["background"])
    ratios = {
        "text-primary on bg-primary/10": contrast_ratio(colors["primary"], primary_tint),
        "primary-foreground on primary": contrast_ratio(colors["primary-foreground"], colors["primary"]),
        "text-destructive on background": contrast_ratio(colors["destructive"], colors["background"]),
        "text-destructive on bg-destructive/10": contrast_ratio(colors["destructive"], destructive_tint),
        "destructive-foreground on destructive": contrast_ratio(
            colors["destructive-foreground"], colors["destructive"]
        ),
        "foreground on background": contrast_ratio(colors["foreground"], colors["background"]),
    }
    failing = {pair: round(r, 2) for pair, r in ratios.items() if r < WCAG_AA_TEXT_CONTRAST}
    assert not failing, (
        f"{name} ({theme}): pairings below WCAG AA ({WCAG_AA_TEXT_CONTRAST}:1): {failing}. "
        f"Darken the token in {_CSS_FILES[name]}"
    )


def test_landing_light_primary_matches_scaffold() -> None:
    assert _light_primary(_LANDING_CSS) == _light_primary(_SCAFFOLD_CSS), (
        f"{_LANDING_CSS} light --primary drifted from the scaffold's"
    )


def test_mobile_light_primary_matches_scaffold() -> None:
    source = _MOBILE_COLORS.read_text(encoding="utf-8")
    light = re.search(r"lightColors[^=]*=\s*\{(?P<body>.*?)\n\};", source, re.S)
    assert light, f"{_MOBILE_COLORS}: lightColors object not found"
    primary = re.search(r'\bprimary:\s*"hsl\(([^)]*)\)"', light["body"])
    assert primary, f"{_MOBILE_COLORS}: lightColors.primary is missing or not an hsl() string"
    mobile = " ".join(primary[1].replace(",", " ").split())
    assert mobile == _light_primary(_SCAFFOLD_CSS), (
        f"{_MOBILE_COLORS} lightColors.primary drifted from the scaffold's light --primary"
    )
