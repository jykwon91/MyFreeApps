"""Tier 5 -- scaffold a new app from `infra/templates/scaffold/`.

The scaffold materializes a full app skeleton (backend, frontend, docker,
top-level config). It mirrors the most-mature app's Tier-1 + Tier-2 shape
byte-for-byte except for substituted tokens.

Scaffolds use plain `__TOKEN__` substitution -- NOT Jinja -- so JSX/YAML
double-curly braces in template files never collide with the templating
engine.

The companion :mod:`platform_shared.infra.render` materializes Tier 3
outputs (Caddyfile, docker-compose.yml, caddy.Dockerfile, deploy.yml)
from `infra/templates/*.j2`. This module calls it once at the end so a
single `new_app` invocation produces a fully-bootable app directory.

CLI::

    python -m platform_shared.infra.new_app mypizzatracker \\
        --display-name "MyPizzaTracker" \\
        --api-port 8006 \\
        --caddy-port 8098 \\
        --frontend-port 5178

Optional flags::

    --node-version "20"       Node version baked into the Caddyfile builder.
    --postgres-image postgres:16   Postgres image used by docker-compose.
"""

from __future__ import annotations

import argparse
import re
import shutil
import subprocess
import sys
from pathlib import Path

import yaml

from platform_shared.infra import render as _render

# Tokens substituted in template content. ORDER MATTERS -- longer keys first
# so __APP_DISPLAY_NAME__ does not get partially matched by __APP_.
_TOKEN_ORDER: tuple[str, ...] = (
    "__APP_DISPLAY_NAME__",
    "__APP_SLUG__",
    "__API_PORT__",
    "__FRONTEND_DEV_PORT__",
    "__CADDY_HOST_PORT__",
)

# Slug regex -- lowercase letters, numbers, hyphens; must start with a letter;
# no trailing hyphen; reasonable length.
_SLUG_RE = re.compile(r"^[a-z][a-z0-9-]{1,38}[a-z0-9]$")

# Slugs that would collide with monorepo / Python / npm conventions.
_RESERVED_SLUGS: frozenset[str] = frozenset({
    "packages", "infra", "docker", "scripts", "tests",
    "node", "node_modules", "src", "app", "api",
    "test", "tmp", "build", "dist", "lib",
})


class ScaffoldError(RuntimeError):
    """Raised when scaffolding inputs are invalid or the target exists."""


def _validate_slug(slug: str) -> None:
    if not _SLUG_RE.fullmatch(slug):
        raise ScaffoldError(
            f"Invalid app slug {slug!r}. Must be lowercase, alphanumeric + hyphens, "
            "start with a letter, end alphanumeric, length 3-40."
        )
    if slug in _RESERVED_SLUGS:
        raise ScaffoldError(f"Slug {slug!r} is reserved. Pick another name.")


def _validate_ports(api: int, caddy: int, frontend: int) -> None:
    for label, port in (("--api-port", api), ("--caddy-port", caddy), ("--frontend-port", frontend)):
        if not (1024 <= port <= 65535):
            raise ScaffoldError(f"{label}={port} must be 1024-65535.")
    if len({api, caddy, frontend}) != 3:
        raise ScaffoldError(
            f"Ports must be distinct: api={api} caddy={caddy} frontend={frontend}"
        )


def _repo_root() -> Path:
    """Resolve the monorepo root by walking up from this file."""
    # platform_shared/infra/new_app.py -> up 4 = monorepo root
    return Path(__file__).resolve().parents[4]


def _substitute(text: str, replacements: dict[str, str]) -> str:
    for token in _TOKEN_ORDER:
        text = text.replace(token, replacements[token])
    return text


def _walk_and_copy(src_root: Path, dst_root: Path, replacements: dict[str, str]) -> int:
    """Copy every file under ``src_root`` to ``dst_root`` with token substitution.

    Returns the number of files written.
    """
    count = 0
    for src in src_root.rglob("*"):
        if not src.is_file():
            continue
        rel = src.relative_to(src_root)
        dst = dst_root / rel
        dst.parent.mkdir(parents=True, exist_ok=True)

        try:
            text = src.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            shutil.copy2(src, dst)
        else:
            dst.write_text(_substitute(text, replacements), encoding="utf-8", newline="\n")
        count += 1
    return count


def _write_app_yaml(repo_root: Path, slug: str, *,
                    display_name: str,
                    api_port: int,
                    caddy_host_port: int,
                    node_version: str,
                    postgres_image: str) -> Path:
    """Write the Tier 3 input file (`apps/<slug>/app.yaml`).

    Returns the written path. Field names + structure mirror existing
    apps' app.yaml so :mod:`platform_shared.infra.render` works without
    schema changes.
    """
    data = {
        "app_slug": slug,
        "app_display_name": display_name,
        "api_port": api_port,
        "caddy_host_port": caddy_host_port,
        "node_version": node_version,
        "postgres_image": postgres_image,
        "has_minio_subdomain": False,
        "joins_minio_network": True,
        "block_api_docs": False,
        "include_bundle_tripwire": False,
        "env_seed_command": "create from .env.example first",
        "csp": (
            "default-src 'self'; "
            "script-src 'self' https://challenges.cloudflare.com; "
            "style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data: blob:; "
            "font-src 'self'; "
            "connect-src 'self' https://challenges.cloudflare.com; "
            "frame-src 'self' https://challenges.cloudflare.com; "
            "frame-ancestors 'none'; "
            "base-uri 'self'; "
            "form-action 'self'; "
            "object-src 'none'; "
            "upgrade-insecure-requests"
        ),
        "workers": [],
    }
    path = repo_root / "apps" / slug / "app.yaml"
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="\n") as f:
        yaml.safe_dump(data, f, sort_keys=False)
    return path


def _maybe_regenerate_requirements(backend_dir: Path) -> bool:
    """Best-effort: run `uv sync` then `uv export` so requirements.txt lands.

    Returns True if uv produced requirements.txt; False if uv is missing or
    failed. A missing requirements.txt is documented by the scaffolder's
    final summary so the operator can run uv themselves.
    """
    uv_path = shutil.which("uv")
    if uv_path is None:
        return False

    try:
        subprocess.run(
            [uv_path, "sync"],
            cwd=backend_dir,
            check=True,
            capture_output=True,
            text=True,
        )
        subprocess.run(
            [
                uv_path, "export",
                "--format", "requirements-txt",
                "--no-hashes",
                "--no-emit-project",
                "--output-file", "requirements.txt",
            ],
            cwd=backend_dir,
            check=True,
            capture_output=True,
            text=True,
        )
        return True
    except subprocess.CalledProcessError:
        return False


def scaffold_app(
    *,
    slug: str,
    display_name: str,
    api_port: int,
    caddy_host_port: int,
    frontend_port: int,
    node_version: str = "20",
    postgres_image: str = "postgres:16",
    repo_root: Path | None = None,
    skip_render: bool = False,
    skip_uv: bool = False,
) -> dict[str, object]:
    """Programmatic entry point. Used by both the CLI and the conformance test.

    Raises :class:`ScaffoldError` for any user-recoverable failure.
    Returns a summary dict with counts and paths the caller can assert on.
    """
    _validate_slug(slug)
    _validate_ports(api_port, caddy_host_port, frontend_port)

    root = repo_root or _repo_root()
    app_dir = root / "apps" / slug
    if app_dir.exists():
        raise ScaffoldError(f"Target {app_dir} already exists. Refusing to overwrite.")

    scaffold_root = root / "infra" / "templates" / "scaffold"
    if not scaffold_root.exists():
        raise ScaffoldError(f"Scaffold templates missing at {scaffold_root}")

    replacements = {
        "__APP_SLUG__": slug,
        "__APP_DISPLAY_NAME__": display_name,
        "__API_PORT__": str(api_port),
        "__FRONTEND_DEV_PORT__": str(frontend_port),
        "__CADDY_HOST_PORT__": str(caddy_host_port),
    }

    file_count = _walk_and_copy(scaffold_root, app_dir, replacements)

    app_yaml_path = _write_app_yaml(
        root, slug,
        display_name=display_name,
        api_port=api_port,
        caddy_host_port=caddy_host_port,
        node_version=node_version,
        postgres_image=postgres_image,
    )

    rendered_paths: list[str] = []
    if not skip_render:
        results = _render.render_app(root, slug, write=True)
        rendered_paths = list(results.keys())

    uv_ok = False
    if not skip_uv:
        uv_ok = _maybe_regenerate_requirements(app_dir / "backend")

    return {
        "app_dir": str(app_dir),
        "files_written": file_count,
        "app_yaml": str(app_yaml_path),
        "rendered": rendered_paths,
        "uv_export_succeeded": uv_ok,
    }


def _cli() -> int:
    parser = argparse.ArgumentParser(
        prog="platform_shared.infra.new_app",
        description="Scaffold a new MyFreeApps app from infra/templates/scaffold/.",
    )
    parser.add_argument("slug", help="App slug (lowercase, alphanumeric+hyphens, e.g. mypizzatracker)")
    parser.add_argument("--display-name", required=True,
                        help='Human-readable name, e.g. "MyPizzaTracker".')
    parser.add_argument("--api-port", type=int, required=True,
                        help="Backend uvicorn port, e.g. 8006.")
    parser.add_argument("--caddy-port", type=int, required=True,
                        help="Caddy host-side port, e.g. 8098.")
    parser.add_argument("--frontend-port", type=int, required=True,
                        help="Vite dev-server port, e.g. 5178.")
    parser.add_argument("--node-version", default="20",
                        help='Node version for the Caddy builder (default "20").')
    parser.add_argument("--postgres-image", default="postgres:16",
                        help='Postgres image (default "postgres:16").')
    parser.add_argument("--skip-render", action="store_true",
                        help="Skip Tier 3 render after scaffolding (advanced).")
    parser.add_argument("--skip-uv", action="store_true",
                        help="Skip uv sync/export after scaffolding (advanced).")
    args = parser.parse_args()

    try:
        summary = scaffold_app(
            slug=args.slug,
            display_name=args.display_name,
            api_port=args.api_port,
            caddy_host_port=args.caddy_port,
            frontend_port=args.frontend_port,
            node_version=args.node_version,
            postgres_image=args.postgres_image,
            skip_render=args.skip_render,
            skip_uv=args.skip_uv,
        )
    except ScaffoldError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2

    print(f"Scaffolded app: {summary['app_dir']}")
    print(f"Files written:  {summary['files_written']}")
    print(f"Tier 3 rendered: {len(summary['rendered'])} files")
    if not summary["uv_export_succeeded"]:
        print(
            "WARNING: uv was unavailable or failed. After installing uv, run:\n"
            f"  cd {summary['app_dir']}/backend && uv sync && "
            "uv export --format requirements-txt --no-hashes --no-emit-project "
            "--output-file requirements.txt"
        )
    return 0


if __name__ == "__main__":
    sys.exit(_cli())
