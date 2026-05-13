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
"""

from __future__ import annotations

import argparse
import difflib
import sys
from pathlib import Path
from typing import Any

import yaml
from jinja2 import Environment, FileSystemLoader, StrictUndefined


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
