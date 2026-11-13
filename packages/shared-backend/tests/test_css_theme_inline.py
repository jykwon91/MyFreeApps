"""Theme-token conformance — every app's design tokens must reach Tailwind through `@theme inline`.

Each app's (and the scaffold's) frontend index.css declares shadcn-style HSL tokens under `:root`
and `.dark`. Tailwind v4 only generates `bg-primary`, `hover:bg-muted`, `bg-destructive/10`,
`focus-visible:ring-ring`, `dark:` variants and the rest when the token is registered as a theme
colour. Hand-written `.bg-card { ... }` rules in `@layer utilities` produce exactly those classes
and nothing else, so every variant and opacity modifier the code and @platform/ui use silently
produced no CSS (a "Disable 2FA" button with no red background, no hover state on shared buttons).

The checks:

- the file has exactly one `@theme inline` block, and its body is the canonical mapping below
  filtered to the tokens that file defines in `:root` — every defined token mapped, nothing mapped
  that isn't defined, the same order and shape in every app;
- `.dark` defines no token `:root` lacks;
- every file defines the same token set, so no app lacks a utility another app's code (or
  @platform/ui) can use — `border-input` once compiled to nothing in MyBookkeeper alone;
- no hand-written semantic-token utility (`.bg-card`, `.hover\\:bg-muted:hover`, `@utility bg-card`).

The error message is the fix: edit that file's `@theme inline` block (and infra/templates/scaffold
so new apps inherit it). A new token goes into `_COLOR_ORDER` here first.
"""
from __future__ import annotations

import re
from pathlib import Path

import pytest

from tests.app_index_css import CSS_FILES
from tests.css_contrast import parse_block_tokens

_COLOR_ORDER = (
    "background",
    "foreground",
    "card",
    "card-foreground",
    "primary",
    "primary-foreground",
    "secondary",
    "secondary-foreground",
    "muted",
    "muted-foreground",
    "border",
    "destructive",
    "destructive-foreground",
    "input",
    "ring",
)
_RADIUS_LINES = (
    "--radius-lg: var(--radius);",
    "--radius-md: calc(var(--radius) - 2px);",
    "--radius-sm: calc(var(--radius) - 4px);",
)
_COMMENT = re.compile(r"/\*.*?\*/", re.S)
_THEME_INLINE = re.compile(r"@theme\s+inline\s*\{(?P<body>[^}]*)\}")
_UTILITY = (
    r"(?:bg|text|border(?:-[trblxyse])?|ring(?:-offset)?|outline|fill|stroke|divide|placeholder"
    r"|accent|caret|decoration|shadow|from|via|to)"
)
_TOKEN = "(?:" + "|".join(sorted(map(re.escape, _COLOR_ORDER), key=len, reverse=True)) + ")"
# A class selector naming a semantic utility, with any escaped variant prefix (`hover\:`) and
# opacity modifier (`\/10`), or an `@utility` definition of one.
_HAND_WRITTEN = re.compile(
    rf"(?<![\w-])\.(?:[\w-]+\\:)*{_UTILITY}-{_TOKEN}(?:\\/\d+)?(?![\w-])"
    rf"|@utility\s+{_UTILITY}-{_TOKEN}(?![\w-])"
)


def expected_theme_lines(defined: set[str]) -> list[str]:
    lines = [f"--color-{name}: hsl(var(--{name}));" for name in _COLOR_ORDER if name in defined]
    if "radius" in defined:
        lines.extend(_RADIUS_LINES)
    return lines


def theme_inline_lines(css: str) -> list[str]:
    blocks = _THEME_INLINE.findall(_COMMENT.sub("", css))
    assert len(blocks) == 1, f"expected exactly one @theme inline block, found {len(blocks)}"
    return [line.strip() for line in blocks[0].splitlines() if line.strip()]


def hand_written_utilities(css: str) -> list[str]:
    return [m.group(0) for m in _HAND_WRITTEN.finditer(_COMMENT.sub("", css))]


def _read(css_path: Path) -> str:
    assert css_path.is_file(), f"{css_path} not found — every app.yaml app needs a web frontend index.css"
    return css_path.read_text(encoding="utf-8")


@pytest.mark.parametrize("name", sorted(CSS_FILES))
def test_theme_inline_maps_every_defined_token(name: str) -> None:
    css_path = CSS_FILES[name]
    css = _read(css_path)
    defined = set(parse_block_tokens(css, ":root"))
    unknown = sorted(defined - set(_COLOR_ORDER) - {"radius"})
    assert not unknown, (
        f"{css_path}: :root defines {unknown}, which test_css_theme_inline.py doesn't know — "
        f"add them to _COLOR_ORDER so every app maps them the same way"
    )
    dark_only = sorted(set(parse_block_tokens(css, ".dark")) - defined)
    assert not dark_only, f"{css_path}: .dark defines {dark_only}, which :root lacks"
    expected = expected_theme_lines(defined)
    actual = theme_inline_lines(css)
    assert actual == expected, (
        f"{css_path}: the @theme inline block must map exactly the tokens :root defines, in the "
        f"canonical order. Replace its body with:\n  " + "\n  ".join(expected)
    )


@pytest.mark.parametrize("name", sorted(CSS_FILES))
def test_every_file_defines_the_same_tokens(name: str) -> None:
    defined = {
        other: set(parse_block_tokens(_read(path), ":root")) for other, path in CSS_FILES.items()
    }
    all_tokens = set().union(*defined.values())
    missing = sorted(all_tokens - defined[name])
    assert not missing, (
        f"{CSS_FILES[name]}: :root lacks {missing}, which other apps define — @platform/ui "
        f"utilities built on them compile to nothing here. Define them in :root and .dark "
        f"(and map them in @theme inline)"
    )


@pytest.mark.parametrize("name", sorted(CSS_FILES))
def test_no_hand_written_semantic_utilities(name: str) -> None:
    css_path = CSS_FILES[name]
    found = hand_written_utilities(_read(css_path))
    assert not found, (
        f"{css_path}: hand-written semantic utilities {found} generate only that exact class, "
        f"never its hover:/focus:/dark: variants or /opacity modifiers. Delete them — the "
        f"@theme inline mapping generates every one Tailwind finds in the source."
    )


def test_expected_lines_follow_canonical_order_and_skip_undefined_tokens() -> None:
    assert expected_theme_lines({"ring", "background", "radius"}) == [
        "--color-background: hsl(var(--background));",
        "--color-ring: hsl(var(--ring));",
        *_RADIUS_LINES,
    ]


def test_theme_inline_lines_ignore_comments() -> None:
    css = "/* @theme inline { --color-x: red; } */\n@theme inline {\n  /* note */\n  --color-ring: hsl(var(--ring));\n}"
    assert theme_inline_lines(css) == ["--color-ring: hsl(var(--ring));"]


@pytest.mark.parametrize(
    "css",
    [
        "@layer utilities { .bg-card { background-color: hsl(var(--card)); } }",
        ".text-muted-foreground { color: hsl(var(--muted-foreground)); }",
        ".hover\\:bg-muted:hover { background-color: hsl(var(--muted)); }",
        ".bg-primary\\/90 { background-color: hsl(var(--primary) / 0.9); }",
        "@utility ring-ring { --tw-ring-color: hsl(var(--ring)); }",
    ],
)
def test_hand_written_utilities_are_detected(css: str) -> None:
    assert hand_written_utilities(css)


@pytest.mark.parametrize(
    "css",
    [
        "* { border-color: hsl(var(--border)); }",
        "body { background-color: hsl(var(--background)); }",
        ".unlock-fade-in { animation: x 200ms; }",
        ".bg-cardinal { color: red; }",
        "/* .bg-card { } */",
    ],
)
def test_non_utility_rules_are_not_flagged(css: str) -> None:
    assert not hand_written_utilities(css)
