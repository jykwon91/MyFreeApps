"""Every inline <script> in an app's index.html is allowed by its CSP hash.

The CSP ``script-src`` has no ``'unsafe-inline'``, so the browser runs an
inline script only if its exact sha256 is listed. Any byte change to the
script (a comment, whitespace) changes the hash, and the build still succeeds
while the browser silently blocks the script — for the theme bootstrap that
means dark-mode users see a light-theme flash. Hash the LF bytes, as CI and
the image build check out (``.gitattributes``) and Vite ships them verbatim.
See rules/inline-script-csp-hashes.md.
"""
from __future__ import annotations

import base64
import hashlib
import re
from pathlib import Path

import pytest
import yaml

_REPO_ROOT = Path(__file__).resolve().parents[3]
_APPS = sorted(
    p.parent.name
    for p in (_REPO_ROOT / "apps").glob("*/app.yaml")
    if (p.parent / "frontend" / "index.html").is_file()
)
_INLINE_SCRIPT = re.compile(r"<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>", re.S)
_SHA256_SOURCE = re.compile(r"'sha256-[A-Za-z0-9+/=]+'")


def _inline_script_hashes(app: str) -> set[str]:
    html = (_REPO_ROOT / "apps" / app / "frontend" / "index.html").read_text(encoding="utf-8")
    bodies = _INLINE_SCRIPT.findall(html.replace("\r\n", "\n"))
    return {
        "'sha256-" + base64.b64encode(hashlib.sha256(body.encode("utf-8")).digest()).decode() + "'"
        for body in bodies
    }


def _script_src_hashes(app: str) -> set[str]:
    config = yaml.safe_load((_REPO_ROOT / "apps" / app / "app.yaml").read_text(encoding="utf-8"))
    [script_src] = [
        directive for directive in config["csp"].split(";")
        if directive.split()[:1] == ["script-src"]
    ]
    return set(_SHA256_SOURCE.findall(script_src))


def test_apps_are_discovered() -> None:
    assert "mybookkeeper" in _APPS and len(_APPS) >= 2


@pytest.mark.parametrize("app", _APPS)
def test_every_inline_script_hash_is_in_script_src(app: str) -> None:
    missing = _inline_script_hashes(app) - _script_src_hashes(app)
    assert not missing, (
        f"apps/{app}/frontend/index.html has inline script(s) hashing to {sorted(missing)}, "
        f"absent from apps/{app}/app.yaml csp script-src — the browser blocks them. "
        "Add the hash and re-render (rules/inline-script-csp-hashes.md)."
    )


@pytest.mark.parametrize("app", _APPS)
def test_script_src_lists_no_stale_hashes(app: str) -> None:
    stale = _script_src_hashes(app) - _inline_script_hashes(app)
    assert not stale, (
        f"apps/{app}/app.yaml csp script-src lists {sorted(stale)}, which matches no inline "
        f"script in apps/{app}/frontend/index.html — remove it."
    )
