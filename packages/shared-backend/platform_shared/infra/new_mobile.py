"""Generate an app's mobile code from ``infra/templates/scaffold-mobile/``.

The web side of the app must already exist: this reads ``apps/<slug>/app.yaml`` and the
web routes, and writes ``apps/<slug>/mobile``. Then it sets ``mobile: true`` in app.yaml,
renders the app's mobile CI workflow and adds the workspace to the root lockfile. If any
step before the lockfile fails, everything it did is undone. A failed ``npm install`` only
warns: the generated app is complete, and needs that command run again.

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
import shutil
import sys
import tempfile
from pathlib import Path

import yaml

from platform_shared.infra import new_app as _new_app
from platform_shared.infra import render as _render
from platform_shared.infra import screen_map as _screen_map
from platform_shared.infra.new_app import ScaffoldError

# Left behind if someone runs the template's workspace in place.
_SKIPPED_DIRS: frozenset[str] = frozenset({"node_modules", ".expo", "dist"})

_MOBILE_FLAG = re.compile(r"^mobile:.*$", re.MULTILINE)

_SEED_REASON = "Not built yet."

_TOKENS: tuple[str, ...] = ("__APP_DISPLAY_NAME__", "__APP_SLUG__", "__APP_SCHEME__")

# Reserved in Java, so they can't be a segment of an Android package name.
_JAVA_KEYWORDS: frozenset[str] = frozenset({
    "abstract", "assert", "boolean", "break", "byte", "case", "catch", "char", "class",
    "const", "continue", "default", "do", "double", "else", "enum", "extends", "false",
    "final", "finally", "float", "for", "goto", "if", "implements", "import", "instanceof",
    "int", "interface", "long", "native", "new", "null", "package", "private", "protected",
    "public", "return", "short", "static", "strictfp", "super", "switch", "synchronized",
    "this", "throw", "throws", "transient", "true", "try", "void", "volatile", "while",
})


def _scheme_for(slug: str) -> str:
    """Slugs allow hyphens. URL schemes and Android package segments can't both take them."""
    return slug.replace("-", "")


def _escaped(value: str) -> str:
    """Escape a value for inside a double-quoted string, in JSON or in JS.

    The template only uses tokens inside those strings. JSX attributes don't take
    backslash escapes, so it writes `heading={"__APP_DISPLAY_NAME__"}` to get a JS one.
    """
    return json.dumps(value, ensure_ascii=False)[1:-1]


def _validate_identifiers(root: Path, slug: str, scheme: str) -> None:
    if scheme in _JAVA_KEYWORDS:
        raise ScaffoldError(
            f"Slug {slug!r} would give the Android package org.myfreeapps.{scheme}, and "
            f"{scheme!r} is a reserved word in Java. Pick another name."
        )
    for other_app_json in root.glob("apps/*/mobile/app.json"):
        other = other_app_json.parent.parent.name
        if other != slug and _scheme_for(other) == scheme:
            raise ScaffoldError(
                f"Slugs {slug!r} and {other!r} would share the bundle ID "
                f"org.myfreeapps.{scheme}. Pick another name."
            )


def _load_display_name(root: Path, slug: str) -> str:
    try:
        config = _render._load_app_config(root, slug)
    except (ValueError, yaml.YAMLError) as exc:
        raise ScaffoldError(f"Can't read apps/{slug}/app.yaml: {exc}") from exc
    display_name = config.get("app_display_name")
    if not isinstance(display_name, str) or not display_name.strip():
        raise ScaffoldError(f"apps/{slug}/app.yaml must set `app_display_name`.")
    return display_name


def _read_or_none(path: Path) -> str | None:
    return path.read_text(encoding="utf-8") if path.is_file() else None


def _restore(saved: dict[Path, str | None]) -> None:
    for path, text in saved.items():
        if text is None:
            path.unlink(missing_ok=True)
        else:
            path.write_text(text, encoding="utf-8", newline="\n")


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

    scheme = _scheme_for(slug)
    _validate_identifiers(root, slug, scheme)
    display_name = _load_display_name(root, slug)
    try:
        routes = _screen_map.web_routes(root, slug)
    except _screen_map.ScreenMapError as exc:
        raise ScaffoldError(str(exc)) from exc

    replacements = {
        "__APP_SLUG__": slug,
        "__APP_DISPLAY_NAME__": _escaped(display_name),
        "__APP_SCHEME__": scheme,
    }

    # Built beside the target and moved into place, so it appears whole or not at all.
    staging = Path(tempfile.mkdtemp(prefix=".mobile-staging-", dir=app_dir))
    saved: dict[Path, str | None] = {app_yaml: app_yaml.read_text(encoding="utf-8")}
    rendered: list[str] = []
    try:
        file_count = _new_app._walk_and_copy(
            template_root, staging, replacements, tokens=_TOKENS, skip_dirs=_SKIPPED_DIRS  # gitleaks:allow
        )
        _set_package_name(staging, slug)
        (staging / _screen_map.SCREEN_MAP_FILENAME).write_text(
            _screen_map.render_seed(routes, _SEED_REASON), encoding="utf-8", newline="\n"
        )
        staging.chmod(0o755)
        staging.rename(mobile_dir)

        _set_mobile_flag(app_yaml)
        if not skip_render:
            # A dry run first: it finds what's missing from app.yaml before anything's written.
            rendered = list(_render.render_app(root, slug, write=False))
            saved.update({root / dest: _read_or_none(root / dest) for dest in rendered})
            _render.render_app(root, slug, write=True)
    except Exception as exc:
        shutil.rmtree(staging, ignore_errors=True)
        shutil.rmtree(mobile_dir, ignore_errors=True)
        _restore(saved)
        raise ScaffoldError(f"Couldn't generate apps/{slug}/mobile, so nothing changed: {exc}") from exc

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
