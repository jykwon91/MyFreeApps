"""Generate an app's mobile code from ``infra/templates/scaffold-mobile/``.

The web side of the app must already exist: this reads ``apps/<slug>/app.yaml`` and the
web routes, and writes ``apps/<slug>/mobile``. Then it sets ``mobile: true`` in app.yaml,
renders the app's mobile CI workflow and adds the workspace to the root lockfile.

CLI::

    python -m platform_shared.infra.new_mobile mypizzatracker

Optional flags::

    --skip-render   Don't render the mobile CI workflow (needs a complete app.yaml).
    --skip-npm      Don't run `npm install` at the monorepo root.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

from platform_shared.infra import new_app as _new_app
from platform_shared.infra import render as _render
from platform_shared.infra import screen_map as _screen_map
from platform_shared.infra.new_app import ScaffoldError

# Left behind if someone runs the template's workspace in place.
_SKIPPED_DIRS: frozenset[str] = frozenset({"node_modules", ".expo", "dist"})

_MOBILE_FLAG = re.compile(r"^mobile:.*$", re.MULTILINE)

_SEED_REASON = "Not built yet."


def _scheme_for(slug: str) -> str:
    """Slugs allow hyphens. URL schemes and Android package segments can't both take them."""
    return slug.replace("-", "")


def _set_package_name(mobile_dir: Path, slug: str) -> None:
    # Not a token: the template is an npm workspace, and `__APP_SLUG__-mobile` is not a
    # valid package name.
    manifest_path = mobile_dir / "package.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest["name"] = f"{slug}-mobile"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8", newline="\n")


def _set_mobile_flag(app_yaml: Path) -> None:
    # Edited as text, because a YAML round trip would drop the file's comments.
    text = app_yaml.read_text(encoding="utf-8")
    if _MOBILE_FLAG.search(text):
        text = _MOBILE_FLAG.sub("mobile: true", text)
    else:
        text = text.rstrip("\n") + "\nmobile: true\n"
    app_yaml.write_text(text, encoding="utf-8", newline="\n")


def scaffold_mobile(
    *,
    slug: str,
    repo_root: Path | None = None,
    skip_render: bool = False,
    skip_npm: bool = False,
) -> dict[str, object]:
    """Programmatic entry point. Raises :class:`ScaffoldError` on invalid input."""
    _new_app._validate_slug(slug)

    root = repo_root or _new_app._repo_root()
    app_dir = root / "apps" / slug
    app_yaml = app_dir / "app.yaml"
    if not app_yaml.is_file():
        raise ScaffoldError(f"{app_yaml} is missing. Create the app first with new_app.")

    mobile_dir = app_dir / "mobile"
    if mobile_dir.exists():
        raise ScaffoldError(f"Target {mobile_dir} already exists. Refusing to overwrite.")

    template_root = root / "infra" / "templates" / "scaffold-mobile"
    if not template_root.is_dir():
        raise ScaffoldError(f"Scaffold templates missing at {template_root}")

    config = _render._load_app_config(root, slug)
    replacements = {
        "__APP_SLUG__": slug,
        "__APP_DISPLAY_NAME__": str(config["app_display_name"]),
        "__APP_SCHEME__": _scheme_for(slug),
    }
    file_count = _new_app._walk_and_copy(
        template_root, mobile_dir, replacements, skip_dirs=_SKIPPED_DIRS
    )
    _set_package_name(mobile_dir, slug)

    screen_map_path = mobile_dir / _screen_map.SCREEN_MAP_FILENAME
    screen_map_path.write_text(
        _screen_map.render_seed(_screen_map.web_routes(root, slug), _SEED_REASON),
        encoding="utf-8",
        newline="\n",
    )

    _set_mobile_flag(app_yaml)

    rendered: list[str] = []
    if not skip_render:
        rendered = list(_render.render_app(root, slug, write=True))

    npm_ok = False
    if not skip_npm:
        npm_ok = _new_app._maybe_npm_install(root)

    return {
        "mobile_dir": str(mobile_dir),
        "files_written": file_count + 1,
        "rendered": rendered,
        "npm_install_succeeded": npm_ok,
    }


def _cli() -> int:
    parser = argparse.ArgumentParser(
        prog="platform_shared.infra.new_mobile",
        description="Generate apps/<slug>/mobile from infra/templates/scaffold-mobile/.",
    )
    parser.add_argument("slug", help="Slug of an existing app, e.g. mypizzatracker")
    parser.add_argument("--skip-render", action="store_true",
                        help="Don't render the mobile CI workflow (needs a complete app.yaml).")
    parser.add_argument("--skip-npm", action="store_true",
                        help="Don't run `npm install` at the monorepo root.")
    args = parser.parse_args()

    try:
        summary = scaffold_mobile(
            slug=args.slug,
            skip_render=args.skip_render,
            skip_npm=args.skip_npm,
        )
    except ScaffoldError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2

    print(f"Generated mobile app: {summary['mobile_dir']}")
    print(f"Files written:        {summary['files_written']}")
    print(f"Workflows rendered:   {len(summary['rendered'])}")
    print(
        f"Next: add a Dependabot entry for /apps/{args.slug}/mobile (copy "
        "/infra/templates/scaffold-mobile in .github/dependabot.yml), and fill in "
        f"apps/{args.slug}/mobile/screen-map.yaml as screens get built."
    )
    if not summary["npm_install_succeeded"]:
        print(
            "WARNING: npm install at monorepo root was skipped or failed.\n"
            "  Run `npm install` from the monorepo root before pushing, or CI fails "
            "on `npm ci EUSAGE` for the new workspace."
        )
    return 0


if __name__ == "__main__":
    sys.exit(_cli())
