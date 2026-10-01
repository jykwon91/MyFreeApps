"""Tier 3 — render per-app infra files from Jinja templates.

Templates live in `infra/templates/`. Per-app config in `apps/<slug>/app.yaml`.
Rendered output is checked in alongside the template — the templates are the
source of truth; the conformance test in
`tests/test_app_conformance.py::TestInfraTemplateDrift` diffs rendered output
vs checked-in to surface drift.

CLI:
    python -m platform_shared.infra.render --app <slug>           # render + write
    python -m platform_shared.infra.render --app <slug> --check   # diff vs disk
    python -m platform_shared.infra.render --all                  # render every app
    python -m platform_shared.infra.render --all --check          # check every app

The renderer never runs inside a request handler — only from CI, tests, or the
future scaffolder CLI. `jinja2` and `PyYAML` are dev-only deps of
platform_shared for that reason.

app.yaml keys
-------------
Standard keys (required):
  app_slug          str   Lowercase slug matching the apps/<slug>/ directory.
  app_display_name  str   Human-readable display name, e.g. "MyBookkeeper".
  api_port          int   Uvicorn port inside the container, e.g. 8000.
  caddy_host_port   int   Host-side port Caddy listens on, e.g. 8094.
  node_version      str   Node major version for the Vite build stage, e.g. "22".
  postgres_image    str   Docker Hub postgres image + tag.
  csp               str   Full Content-Security-Policy header value.
  env_seed_command  str   Shell snippet shown in the deploy workflow on missing .env.

Boolean flags (optional, all default false/disabled when absent):
  has_minio_subdomain     bool   True when the app uses a storage.{$DOMAIN} subdomain
                                 fronted by MinIO (adds the @storage handle block).
  joins_minio_network     bool   True when docker-compose joins the shared minio network.
  block_api_docs          bool   True to serve 404 for /api/docs* in the Caddyfile.
  include_bundle_tripwire bool   True to enable the post-deploy bundle freshness check.
  automated_deploy        bool   True (default) to add push trigger to deploy workflow.
  registry_images         bool   True to build images in CI (GHCR) instead of on-VPS.
  serve_only_build_arg    bool   True (MGA only) to wire the VITE_SERVE_ONLY build arg.
  discord_activity        bool   True to let Discord iframe the SPA as an Activity.
                                 Non-minio Caddyfile branch only. The SPA handler gets
                                 ``csp`` with ``frame-ancestors`` swapped for
                                 ``DISCORD_ACTIVITY_FRAME_ANCESTORS`` (and no
                                 X-Frame-Options); the API handler keeps XFO DENY + the
                                 app's ``csp``. Apps without the flag render unchanged.

Permissions-Policy (optional):
  permissions_policy_self  list[str]   Features to allow for the app's own origin.
                                       Default: empty list (all features denied).
                                       Example: [microphone] for a voice app.

                           The full policy header is computed by ``_build_permissions_policy``
                           from the canonical feature order below. Every feature not listed in
                           ``permissions_policy_self`` is emitted as ``feature=()``;  listed
                           features are emitted as ``feature=(self)``. Unknown feature names
                           raise ``ValueError`` so typos are caught at render time. The
                           computed value is injected into the Jinja context as
                           ``{{ permissions_policy }}`` and used in both branches of
                           ``infra/templates/Caddyfile.docker.j2``.

Other keys:
  workers               list   Worker definitions, each with ``name`` and ``command``.
  post_deploy_commands  list   Shell commands run in-container after ``alembic upgrade head``.
"""

from __future__ import annotations

import argparse
import difflib
import re
import sys
from pathlib import Path
from typing import Any

import yaml
from jinja2 import Environment, FileSystemLoader, StrictUndefined


# Canonical feature order for the Permissions-Policy header.  This list is the
# single source of truth — the order matches what was previously hardcoded in
# Caddyfile.docker.j2.  Add new features here (at the end) to keep the header
# stable across re-renders.
_PERMISSIONS_POLICY_FEATURES: tuple[str, ...] = (
    "accelerometer",
    "camera",
    "geolocation",
    "gyroscope",
    "magnetometer",
    "microphone",
    "payment",
    "usb",
    "interest-cohort",
    "browsing-topics",
)


def _build_permissions_policy(self_allow: list[str]) -> str:
    """Build the Permissions-Policy header value.

    Each feature in ``_PERMISSIONS_POLICY_FEATURES`` is emitted as
    ``feature=(self)`` when it appears in ``self_allow``, or ``feature=()``
    otherwise.  Unknown feature names in ``self_allow`` raise ``ValueError``
    so typos are caught at render time rather than silently shipped.

    Args:
        self_allow: Feature names to grant ``(self)`` permission.  Empty list
                    (the default) denies all features.

    Returns:
        A ready-to-embed header value string, e.g.
        ``"accelerometer=(), ..., microphone=(self), ..."``.

    Raises:
        ValueError: If any name in ``self_allow`` is not in
                    ``_PERMISSIONS_POLICY_FEATURES``.
    """
    known = set(_PERMISSIONS_POLICY_FEATURES)
    unknown = set(self_allow) - known
    if unknown:
        sorted_unknown = ", ".join(sorted(unknown))
        sorted_known = ", ".join(_PERMISSIONS_POLICY_FEATURES)
        raise ValueError(
            f"permissions_policy_self contains unknown feature(s): {sorted_unknown}. "
            f"Allowed features: {sorted_known}"
        )
    self_set = set(self_allow)
    parts = [
        f"{feature}=(self)" if feature in self_set else f"{feature}=()"
        for feature in _PERMISSIONS_POLICY_FEATURES
    ]
    return ", ".join(parts)


# Origins allowed to frame the SPA of an app with ``discord_activity: true``.
# Discord serves an Activity from https://<client_id>.discordsays.com, iframed
# by the web + desktop clients on discord.com (stable / ptb / canary are all
# *.discord.com; discordapp.com is the legacy alias the Embedded App SDK still
# accepts messages from) and hosted under *.discordsays.com on mobile.
DISCORD_ACTIVITY_FRAME_ANCESTORS: tuple[str, ...] = (
    "https://discord.com",
    "https://*.discord.com",
    "https://discordapp.com",
    "https://*.discordapp.com",
    "https://*.discordsays.com",
)

_FRAME_ANCESTORS_DIRECTIVE = re.compile(r"(?<![\w-])frame-ancestors(?![\w-])[^;]*")


def _build_discord_activity_csp(csp: str) -> str:
    """Return ``csp`` with ``frame-ancestors`` admitting Discord's Activity host only.

    The existing ``frame-ancestors`` directive is replaced in place — or one is
    appended when the policy has none — and every other byte is left alone, so
    inline-script hashes in ``script-src`` stay valid.

    Raises:
        ValueError: ``csp`` is empty or declares ``frame-ancestors`` twice.
    """
    if not csp.strip():
        raise ValueError("discord_activity needs the app's `csp` to derive the SPA policy from")
    directive = "frame-ancestors " + " ".join(DISCORD_ACTIVITY_FRAME_ANCESTORS)
    matches = _FRAME_ANCESTORS_DIRECTIVE.findall(csp)
    if len(matches) > 1:
        raise ValueError("csp declares frame-ancestors more than once")
    if not matches:
        return f"{csp.rstrip().rstrip(';').rstrip()}; {directive}"
    return _FRAME_ANCESTORS_DIRECTIVE.sub(lambda _match: directive, csp, count=1)


def _apply_discord_activity(ctx: dict[str, Any]) -> None:
    """Normalise the ``discord_activity`` flag and derive ``discord_activity_csp``."""
    enabled = ctx.get("discord_activity", False)
    if not isinstance(enabled, bool):
        raise ValueError(f"discord_activity must be true/false, got {enabled!r}")
    ctx["discord_activity"] = enabled
    if not enabled:
        return
    if ctx.get("has_minio_subdomain"):
        raise ValueError(
            "discord_activity is only implemented for the non-minio Caddyfile "
            "branch (has_minio_subdomain: false)"
        )
    ctx["discord_activity_csp"] = _build_discord_activity_csp(str(ctx.get("csp") or ""))


# Each entry maps a template path (relative to infra/templates/) to its
# rendered destination (relative to the monorepo root). `{app_slug}` is
# expanded per app at render time.
TEMPLATE_MAP: list[tuple[str, str]] = [
    ("docker/caddy.Dockerfile.j2", "apps/{app_slug}/docker/caddy.Dockerfile"),
    ("Caddyfile.docker.j2", "apps/{app_slug}/docker/Caddyfile.docker"),
    ("docker-compose.yml.j2", "apps/{app_slug}/docker-compose.yml"),
    (".github/workflows/deploy.yml.j2", ".github/workflows/deploy-{app_slug}.yml"),
]


def _repo_root() -> Path:
    """Return the monorepo root (the dir containing `infra/`, `apps/`, `.github/`)."""
    here = Path(__file__).resolve()
    # platform_shared/infra/render.py → up 4 = monorepo root
    return here.parents[4]


def _load_app_config(repo_root: Path, app_slug: str) -> dict[str, Any]:
    path = repo_root / "apps" / app_slug / "app.yaml"
    if not path.exists():
        raise FileNotFoundError(f"No app.yaml for '{app_slug}' at {path}")
    with path.open("r", encoding="utf-8") as f:
        data = yaml.safe_load(f)
    if not isinstance(data, dict):
        raise ValueError(f"app.yaml at {path} must be a mapping, got {type(data)}")
    if data.get("app_slug") != app_slug:
        raise ValueError(
            f"app.yaml at {path} has app_slug={data.get('app_slug')!r} but file is in apps/{app_slug}/"
        )
    return data


def _list_apps(repo_root: Path) -> list[str]:
    apps_dir = repo_root / "apps"
    return sorted(p.parent.name for p in apps_dir.glob("*/app.yaml"))


def _normalize(text: str) -> str:
    """Force LF line endings + ensure trailing newline. Matches how git stores text."""
    text = text.replace("\r\n", "\n")
    if not text.endswith("\n"):
        text = text + "\n"
    return text


def _render_one(env: Environment, template_rel: str, ctx: dict[str, Any]) -> str:
    tmpl = env.get_template(template_rel)
    return _normalize(tmpl.render(**ctx))


def render_app(repo_root: Path, app_slug: str, *, write: bool) -> dict[str, tuple[str, str]]:
    """Render every template for one app.

    Returns a mapping of dest_path → (rendered_text, current_text_or_empty).
    When ``write`` is True, the file is also written to disk.
    """
    ctx = _load_app_config(repo_root, app_slug)

    # Compute the Permissions-Policy header value from the app's opt-in list and
    # inject it so templates can reference {{ permissions_policy }} directly.
    permissions_policy_self: list[str] = ctx.get("permissions_policy_self") or []
    ctx["permissions_policy"] = _build_permissions_policy(permissions_policy_self)
    _apply_discord_activity(ctx)

    env = Environment(
        loader=FileSystemLoader(str(repo_root / "infra" / "templates")),
        undefined=StrictUndefined,
        keep_trailing_newline=True,
        autoescape=False,
    )

    results: dict[str, tuple[str, str]] = {}
    for tmpl_rel, dest_pattern in TEMPLATE_MAP:
        dest_rel = dest_pattern.format(app_slug=app_slug)
        dest = repo_root / dest_rel
        rendered = _render_one(env, tmpl_rel, ctx)
        current = ""
        if dest.exists():
            current = _normalize(dest.read_text(encoding="utf-8"))
        if write:
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_text(rendered, encoding="utf-8", newline="\n")
        results[dest_rel] = (rendered, current)
    return results


def diff_app(repo_root: Path, app_slug: str) -> list[str]:
    """Return a list of unified-diff blocks (one per drifted file). Empty = clean."""
    results = render_app(repo_root, app_slug, write=False)
    diffs: list[str] = []
    for dest_rel, (rendered, current) in results.items():
        if rendered == current:
            continue
        block = "\n".join(
            difflib.unified_diff(
                current.splitlines(),
                rendered.splitlines(),
                fromfile=f"a/{dest_rel}",
                tofile=f"b/{dest_rel}",
                lineterm="",
            )
        )
        diffs.append(block)
    return diffs


def _cli() -> int:
    parser = argparse.ArgumentParser(prog="platform_shared.infra.render")
    g = parser.add_mutually_exclusive_group(required=True)
    g.add_argument("--app", help="App slug (matches apps/<slug>/app.yaml)")
    g.add_argument("--all", action="store_true", help="Render every app under apps/")
    parser.add_argument(
        "--check", action="store_true",
        help="Don't write; diff rendered output vs checked-in files. Exit non-zero on drift.",
    )
    args = parser.parse_args()

    repo_root = _repo_root()
    slugs = _list_apps(repo_root) if args.all else [args.app]

    if args.check:
        any_drift = False
        for slug in slugs:
            diffs = diff_app(repo_root, slug)
            if diffs:
                any_drift = True
                print(f"DRIFT in app '{slug}':", file=sys.stderr)
                for block in diffs:
                    print(block, file=sys.stderr)
                    print(file=sys.stderr)
        return 1 if any_drift else 0

    for slug in slugs:
        render_app(repo_root, slug, write=True)
        print(f"Rendered: {slug}")
    return 0


if __name__ == "__main__":
    sys.exit(_cli())
