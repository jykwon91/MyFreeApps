"""Landing page conformance — keep myfreeapps.org in sync with what's deployed.

The landing page (sites/landing/public/) is hand-written static HTML served by
host Caddy (infra/Caddyfile). These tests fail CI when:

- an app hostname is added to infra/Caddyfile but not linked from the page
  (a deployed app nobody can find), or the page links a hostname host Caddy
  does not serve (a dead link);
- the page grows a <script>, <style>, or style="" attribute, which the
  landing block's CSP (`default-src 'none'; style-src 'self'`) would block —
  silently, in the browser only;
- the Caddy `root` stops pointing at the directory the page lives in.

Each test is one assertion. The error message is the fix.
"""
from __future__ import annotations

import re
from html.parser import HTMLParser
from pathlib import Path

# tests/ -> shared-backend/ -> packages/ -> repo/
_REPO_ROOT = Path(__file__).resolve().parents[3]
_CADDYFILE = _REPO_ROOT / "infra" / "Caddyfile"
_PUBLIC_DIR = _REPO_ROOT / "sites" / "landing" / "public"
_VPS_CHECKOUT = "/srv/myfreeapps"
_APEX = "myfreeapps.org"

# Hostnames host Caddy serves that are infrastructure, not apps a person visits.
_NON_APP_HOSTS = {"storage.myfreeapps.org", "www.myfreeapps.org"}

_SITE_ADDRESS_LINE = re.compile(r"^([a-z0-9][a-z0-9.,\s-]*?)\s*\{\s*$")
_APP_URL = re.compile(r"^https://([a-z0-9-]+\.myfreeapps\.org)/?$")


class _PageScan(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.hrefs: list[str] = []
        self.forbidden: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attr_map = dict(attrs)
        if tag in ("script", "style"):
            self.forbidden.append(f"<{tag}>")
        if "style" in attr_map:
            self.forbidden.append(f'<{tag} style="...">')
        if tag == "a" and attr_map.get("href"):
            self.hrefs.append(attr_map["href"] or "")


def _caddy_site_blocks() -> dict[str, str]:
    """Map each top-level site address in infra/Caddyfile to its block body."""
    blocks: dict[str, str] = {}
    lines = _CADDYFILE.read_text(encoding="utf-8").splitlines()
    for i, line in enumerate(lines):
        match = _SITE_ADDRESS_LINE.match(line)
        if not match:
            continue
        body: list[str] = []
        for inner in lines[i + 1:]:
            if inner.startswith("}"):
                break
            body.append(inner)
        for address in match.group(1).split(","):
            blocks[address.strip()] = "\n".join(body)
    return blocks


def _served_app_hosts() -> set[str]:
    return {
        host
        for host in _caddy_site_blocks()
        if host.endswith(f".{_APEX}") and host not in _NON_APP_HOSTS
    }


def _scan_page() -> _PageScan:
    scan = _PageScan()
    scan.feed((_PUBLIC_DIR / "index.html").read_text(encoding="utf-8"))
    return scan


def _linked_app_hosts() -> set[str]:
    return {
        match.group(1)
        for href in _scan_page().hrefs
        if (match := _APP_URL.match(href))
    }


def test_every_deployed_app_is_linked() -> None:
    missing = _served_app_hosts() - _linked_app_hosts()
    assert not missing, (
        f"infra/Caddyfile serves {sorted(missing)} but sites/landing/public/index.html "
        "does not link to it. Add a card for the app to the landing page (or, if the "
        "hostname is infrastructure rather than an app, add it to _NON_APP_HOSTS here)."
    )


def test_every_app_link_is_served() -> None:
    dead = _linked_app_hosts() - _served_app_hosts()
    assert not dead, (
        f"sites/landing/public/index.html links {sorted(dead)} but infra/Caddyfile has "
        "no site block for it — the link is dead. Remove the card or add the host block."
    )


def test_page_has_no_csp_blocked_markup() -> None:
    forbidden = _scan_page().forbidden
    assert not forbidden, (
        f"sites/landing/public/index.html contains {forbidden}. The myfreeapps.org CSP "
        "allows no scripts and only same-origin stylesheets — move styling into "
        "styles.css and keep the page script-free."
    )


def test_caddy_root_points_at_landing_page() -> None:
    body = _caddy_site_blocks().get(_APEX, "")
    expected_root = f"{_VPS_CHECKOUT}/{_PUBLIC_DIR.relative_to(_REPO_ROOT).as_posix()}"
    assert f"root * {expected_root}" in body, (
        f"The {_APEX} block in infra/Caddyfile must serve `root * {expected_root}` — "
        "the checkout path of sites/landing/public/ on the VPS."
    )


def test_landing_page_files_exist() -> None:
    missing = [
        name for name in ("index.html", "styles.css") if not (_PUBLIC_DIR / name).is_file()
    ]
    assert not missing, (
        f"sites/landing/public/ is missing {missing}; deploy-landing.yml verifies both "
        "serve with HTTP 200 after every deploy."
    )
