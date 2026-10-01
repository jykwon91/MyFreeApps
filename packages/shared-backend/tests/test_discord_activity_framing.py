"""Discord Activity framing — the opt-in ``discord_activity`` Caddy option.

An app with ``discord_activity: true`` in app.yaml lets Discord iframe its SPA
(HTML + assets) via CSP ``frame-ancestors``; its API keeps ``X-Frame-Options:
DENY`` + ``frame-ancestors 'none'``. Every other app must render exactly as
before. The drift test can't catch a regression here (template + rendered
files would change together), so the shapes are asserted explicitly — for the
CSP builder, the render context, and the checked-in Caddyfiles.
"""
from __future__ import annotations

import base64
import hashlib
import re
from pathlib import Path

import pytest

from platform_shared.infra.render import (
    DISCORD_ACTIVITY_FRAME_ANCESTORS,
    _apply_discord_activity,
    _build_discord_activity_csp,
    render_app,
)

_REPO_ROOT = Path(__file__).resolve().parents[3]
_APPS = sorted(p.parent.name for p in (_REPO_ROOT / "apps").glob("*/app.yaml"))

# Apps that opted in. Membership is a reviewed product decision — the test
# below fails if an app.yaml flag and this set disagree.
_DISCORD_ACTIVITY_APPS = {"mygamingassistant"}

_DISCORD_FRAME_ANCESTORS = "frame-ancestors " + " ".join(DISCORD_ACTIVITY_FRAME_ANCESTORS)

_SAMPLE_CSP = (
    "default-src 'self'; script-src 'self' 'sha256-AAAA+/=' https://x.example; "
    "frame-src 'self' https://www.youtube-nocookie.com; frame-ancestors 'none'; "
    "base-uri 'self'; upgrade-insecure-requests"
)


def _read(*parts: str) -> str:
    return _REPO_ROOT.joinpath(*parts).read_text(encoding="utf-8")


def _block(text: str, opener: str) -> str:
    """Body of the brace block starting at ``opener`` (``""`` when absent)."""
    start = text.find(opener)
    if start == -1:
        return ""
    depth = 0
    for i in range(start + len(opener) - 1, len(text)):
        if text[i] == "{":
            depth += 1
        elif text[i] == "}":
            depth -= 1
            if depth == 0:
                return text[start + len(opener): i]
    raise AssertionError(f"unbalanced braces after {opener!r}")


def _strip_comments(block: str) -> str:
    return "\n".join(line.split("#", 1)[0] for line in block.splitlines())


def _site_blocks(caddyfile: str) -> tuple[str, str, str]:
    """(global header block, API handle, SPA handle) of a non-minio Caddyfile."""
    site = _strip_comments(_block(caddyfile, ":80 {"))
    api = _block(site, "handle /api/* {")
    site_without_api = site.replace(api, "", 1)
    spa = _block(site_without_api, "\n    handle {")
    global_header = _block(site_without_api.replace(spa, "", 1), "\n    header {")
    return global_header, api, spa


def _csp_values(block: str) -> list[str]:
    return re.findall(r'Content-Security-Policy "([^"]*)"', block)


class TestBuildDiscordActivityCsp:
    def test_swaps_only_frame_ancestors(self) -> None:
        result = _build_discord_activity_csp(_SAMPLE_CSP)

        assert result == _SAMPLE_CSP.replace("frame-ancestors 'none'", _DISCORD_FRAME_ANCESTORS)
        assert "'none'" not in result.split("frame-ancestors", 1)[1].split(";", 1)[0]
        assert "frame-src 'self' https://www.youtube-nocookie.com" in result
        assert "'sha256-AAAA+/='" in result

    def test_appends_when_the_policy_has_no_frame_ancestors(self) -> None:
        assert _build_discord_activity_csp("default-src 'self';") == (
            f"default-src 'self'; {_DISCORD_FRAME_ANCESTORS}"
        )

    def test_rejects_an_empty_policy(self) -> None:
        with pytest.raises(ValueError, match="csp"):
            _build_discord_activity_csp("  ")

    def test_rejects_a_duplicated_directive(self) -> None:
        with pytest.raises(ValueError, match="more than once"):
            _build_discord_activity_csp("frame-ancestors 'none'; frame-ancestors 'self'")

    def test_allows_discord_and_nothing_else(self) -> None:
        assert set(DISCORD_ACTIVITY_FRAME_ANCESTORS) == {
            "https://discord.com",
            "https://*.discord.com",
            "https://discordapp.com",
            "https://*.discordapp.com",
            "https://*.discordsays.com",
        }


class TestApplyDiscordActivity:
    def test_absent_flag_is_false_and_adds_no_policy(self) -> None:
        ctx: dict[str, object] = {"csp": _SAMPLE_CSP}
        _apply_discord_activity(ctx)
        assert ctx["discord_activity"] is False
        assert "discord_activity_csp" not in ctx

    def test_enabled_flag_derives_the_spa_policy(self) -> None:
        ctx: dict[str, object] = {"csp": _SAMPLE_CSP, "discord_activity": True}
        _apply_discord_activity(ctx)
        assert ctx["discord_activity_csp"] == _build_discord_activity_csp(_SAMPLE_CSP)

    def test_non_boolean_flag_is_rejected(self) -> None:
        with pytest.raises(ValueError, match="true/false"):
            _apply_discord_activity({"csp": _SAMPLE_CSP, "discord_activity": "yes"})

    def test_minio_branch_is_rejected(self) -> None:
        with pytest.raises(ValueError, match="has_minio_subdomain"):
            _apply_discord_activity(
                {"csp": _SAMPLE_CSP, "discord_activity": True, "has_minio_subdomain": True}
            )


@pytest.mark.parametrize("app", _APPS)
def test_app_yaml_flag_matches_the_reviewed_set(app: str) -> None:
    enabled = re.search(r"^discord_activity:\s*true\b", _read("apps", app, "app.yaml"), re.MULTILINE)
    assert bool(enabled) == (app in _DISCORD_ACTIVITY_APPS), (
        f"{app}: app.yaml discord_activity and _DISCORD_ACTIVITY_APPS disagree — "
        "letting Discord frame an app is a reviewed decision; update both together."
    )


@pytest.mark.parametrize("app", sorted(_DISCORD_ACTIVITY_APPS))
class TestOptedInCaddyfile:
    def test_spa_is_frameable_by_discord_only(self, app: str) -> None:
        _, _, spa = _site_blocks(_read("apps", app, "docker", "Caddyfile.docker"))
        [spa_csp] = _csp_values(spa)
        assert _DISCORD_FRAME_ANCESTORS in spa_csp
        assert "frame-ancestors 'none'" not in spa_csp
        assert "X-Frame-Options" not in spa

    def test_spa_policy_is_the_app_csp_with_only_frame_ancestors_swapped(self, app: str) -> None:
        caddyfile = _read("apps", app, "docker", "Caddyfile.docker")
        global_header, api, spa = _site_blocks(caddyfile)
        [api_csp] = _csp_values(api)
        [spa_csp] = _csp_values(spa)
        assert spa_csp == _build_discord_activity_csp(api_csp)

    def test_api_keeps_the_strict_framing_pair(self, app: str) -> None:
        _, api, _ = _site_blocks(_read("apps", app, "docker", "Caddyfile.docker"))
        assert 'X-Frame-Options "DENY"' in api
        [api_csp] = _csp_values(api)
        assert "frame-ancestors 'none'" in api_csp

    def test_global_header_carries_no_framing_policy(self, app: str) -> None:
        global_header, _, _ = _site_blocks(_read("apps", app, "docker", "Caddyfile.docker"))
        assert "Strict-Transport-Security" in global_header
        assert "X-Frame-Options" not in global_header
        assert "Content-Security-Policy" not in global_header

    def test_inline_script_hashes_survive(self, app: str) -> None:
        _, api, spa = _site_blocks(_read("apps", app, "docker", "Caddyfile.docker"))
        [api_csp] = _csp_values(api)
        [spa_csp] = _csp_values(spa)
        hashes = re.findall(r"'sha256-[^']+'", api_csp)
        assert hashes, "expected the app's inline-script hash in script-src"
        for script_hash in hashes:
            assert script_hash in spa_csp

    def test_rendering_is_stable(self, app: str) -> None:
        rendered = render_app(_REPO_ROOT, app, write=False)
        text, current = rendered[f"apps/{app}/docker/Caddyfile.docker"]
        assert text == current


@pytest.mark.parametrize("app", sorted(set(_APPS) - _DISCORD_ACTIVITY_APPS))
def test_other_apps_stay_unframeable(app: str) -> None:
    caddyfile = _read("apps", app, "docker", "Caddyfile.docker")
    assert "discordsays" not in caddyfile
    assert "discord_activity" not in caddyfile
    assert 'X-Frame-Options "DENY"' in caddyfile
    for csp in _csp_values(caddyfile):
        assert "frame-ancestors 'none'" in csp


def test_mga_inline_theme_script_hash_matches_its_csp() -> None:
    """The theme bootstrap in index.html must be allowed by the CSP hash.

    CI and the image build check out with LF, so hash the LF form — the bytes
    the browser hashes in production. A mismatch means the script is blocked
    and dark-mode users see a light-theme flash (worse inside a Discord frame).
    """
    html = _read("apps", "mygamingassistant", "frontend", "index.html").replace("\r\n", "\n")
    bodies = re.findall(r"<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>", html, re.S)
    assert bodies, "expected the inline theme-bootstrap script"
    csp = re.search(r'^csp: "([^"]*)"', _read("apps", "mygamingassistant", "app.yaml"), re.MULTILINE)
    assert csp is not None
    for body in bodies:
        digest = base64.b64encode(hashlib.sha256(body.encode("utf-8")).digest()).decode()
        assert f"'sha256-{digest}'" in csp.group(1), (
            f"index.html inline script hash sha256-{digest} is missing from the "
            "mygamingassistant csp script-src — regenerate it (rules/inline-script-csp-hashes.md)."
        )
