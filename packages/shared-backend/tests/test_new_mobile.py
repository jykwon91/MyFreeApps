"""platform_shared.infra.new_mobile: generating apps/<slug>/mobile from the scaffold."""
from __future__ import annotations

import json
import re
import shutil
from pathlib import Path

import pytest
import yaml

from platform_shared.infra import render
from platform_shared.infra.new_app import ScaffoldError
from platform_shared.infra.new_mobile import scaffold_mobile
from platform_shared.infra.screen_map import check_app

_REPO_ROOT = Path(__file__).resolve().parents[3]
_TEMPLATES = _REPO_ROOT / "infra" / "templates"
_SLUG = "my-recipes"
_ROUTES = 'export const routes: RouteObject[] = [{ path: "/recipes/:id" }, { path: "/login" }];'
_REQUIRED_FILES = (
    "package.json",
    "app.json",
    "metro.config.js",
    "babel.config.js",
    "jest.config.js",
    "eslint.config.mjs",
    "tsconfig.json",
    ".gitignore",
    "app/_layout.tsx",
    "app/index.tsx",
    "__tests__/index.test.tsx",
    "screen-map.yaml",
)


@pytest.fixture
def repo(tmp_path: Path) -> Path:
    shutil.copytree(_TEMPLATES, tmp_path / "infra" / "templates")
    config = yaml.safe_load((_REPO_ROOT / "apps" / "myrecipes" / "app.yaml").read_text("utf-8"))
    config.update(app_slug=_SLUG, app_display_name="My Recipes")
    app_dir = tmp_path / "apps" / _SLUG
    app_dir.mkdir(parents=True)
    (app_dir / "app.yaml").write_text(
        "# A comment that has to survive.\n" + yaml.safe_dump(config, sort_keys=False), "utf-8"
    )
    routes = app_dir / "frontend" / "src" / "routes.tsx"
    routes.parent.mkdir(parents=True)
    routes.write_text(_ROUTES, "utf-8")
    return tmp_path


def _mobile_dir(repo: Path) -> Path:
    return repo / "apps" / _SLUG / "mobile"


def _generate(repo: Path, *, skip_render: bool = True) -> dict[str, object]:
    return scaffold_mobile(slug=_SLUG, repo_root=repo, skip_render=skip_render, skip_npm=True)


class TestGeneratedFiles:
    def test_writes_every_required_file(self, repo: Path) -> None:
        summary = _generate(repo)
        generated = _mobile_dir(repo)
        for rel in _REQUIRED_FILES:
            assert (generated / rel).is_file(), rel
        assert summary["files_written"] == sum(1 for p in generated.rglob("*") if p.is_file())

    def test_leaves_no_tokens_behind(self, repo: Path) -> None:
        _generate(repo)
        for path in _mobile_dir(repo).rglob("*"):
            if path.is_file():
                assert not re.search(r"__[A-Z_]+__", path.read_text("utf-8")), path

    def test_names_the_app(self, repo: Path) -> None:
        _generate(repo)
        generated = _mobile_dir(repo)

        manifest = json.loads((generated / "package.json").read_text("utf-8"))
        assert manifest["name"] == "my-recipes-mobile"
        assert manifest["main"] == "expo-router/entry"
        for script in ("typecheck", "lint", "test", "doctor", "export"):
            assert script in manifest["scripts"]

        expo = json.loads((generated / "app.json").read_text("utf-8"))["expo"]
        assert expo["name"] == "My Recipes"
        assert expo["slug"] == _SLUG
        # Android packages can't contain hyphens, and neither can this scheme.
        assert expo["scheme"] == "myrecipes"
        assert expo["android"]["package"] == "org.myfreeapps.myrecipes"
        assert expo["ios"]["bundleIdentifier"] == "org.myfreeapps.myrecipes"

        assert "My Recipes" in (generated / "app" / "index.tsx").read_text("utf-8")

    def test_skips_directories_left_in_the_template(self, repo: Path) -> None:
        template = repo / "infra" / "templates" / "scaffold-mobile"
        for rel in ("node_modules/pkg/index.js", ".expo/state.json", "dist/bundle.js", "app/dist/x.js"):
            (template / rel).parent.mkdir(parents=True, exist_ok=True)
            (template / rel).write_text("left over", "utf-8")
        _generate(repo)
        generated = _mobile_dir(repo)
        for rel in ("node_modules", ".expo", "dist", "app/dist"):
            assert not (generated / rel).exists(), rel


class TestScreenMapSeed:
    def test_lists_every_web_route_as_not_built(self, repo: Path) -> None:
        _generate(repo)
        data = yaml.safe_load((_mobile_dir(repo) / "screen-map.yaml").read_text("utf-8"))
        assert data == {
            "routes": {
                "/login": {"not_on_mobile": "Not built yet."},
                "/recipes/:id": {"not_on_mobile": "Not built yet."},
            }
        }

    def test_passes_the_check(self, repo: Path) -> None:
        _generate(repo)
        assert check_app(repo, _SLUG) == []


class TestAppYaml:
    def test_sets_the_flag_and_keeps_comments(self, repo: Path) -> None:
        _generate(repo)
        text = (repo / "apps" / _SLUG / "app.yaml").read_text("utf-8")
        assert text.startswith("# A comment that has to survive.\n")
        assert yaml.safe_load(text)["mobile"] is True

    def test_flips_an_existing_false(self, repo: Path) -> None:
        app_yaml = repo / "apps" / _SLUG / "app.yaml"
        app_yaml.write_text(app_yaml.read_text("utf-8") + "mobile: false\n", "utf-8")
        _generate(repo)
        text = app_yaml.read_text("utf-8")
        assert re.findall(r"^mobile:.*$", text, re.MULTILINE) == ["mobile: true"]


class TestRender:
    def test_renders_the_mobile_workflow_for_the_app(self, repo: Path) -> None:
        summary = _generate(repo, skip_render=False)
        dest = f".github/workflows/ci-mobile-{_SLUG}.yml"
        assert dest in summary["rendered"]

        workflow = yaml.safe_load((repo / dest).read_text("utf-8"))
        job = workflow["jobs"]["mobile"]
        assert job["uses"] == "./.github/workflows/_mobile-checks.yml"
        assert job["with"] == {"project": f"apps/{_SLUG}/mobile", "expo-app": True}
        # `on` parses as YAML's boolean true.
        triggers = workflow[True]
        assert f"apps/{_SLUG}/mobile/**" in triggers["pull_request"]["paths"]
        assert triggers["push"]["paths"] == triggers["pull_request"]["paths"]
        assert "{{" not in (repo / dest).read_text("utf-8").replace("${{", "")

    def test_no_mobile_workflow_without_the_flag(self, repo: Path) -> None:
        rendered = render.render_app(repo, _SLUG, write=False)
        assert not [dest for dest in rendered if "ci-mobile" in dest]

    def test_rendered_output_stays_in_sync(self, repo: Path) -> None:
        _generate(repo, skip_render=False)
        assert render.diff_app(repo, _SLUG) == []

    def test_a_flag_that_isnt_a_bool_fails_the_render(self, repo: Path) -> None:
        app_yaml = repo / "apps" / _SLUG / "app.yaml"
        app_yaml.write_text(app_yaml.read_text("utf-8") + 'mobile: "true"\n', "utf-8")
        with pytest.raises(ValueError, match="mobile must be true/false"):
            render.render_app(repo, _SLUG, write=False)


class TestRefusals:
    def test_invalid_slug(self, repo: Path) -> None:
        with pytest.raises(ScaffoldError, match="Invalid app slug"):
            scaffold_mobile(slug="Not_Valid", repo_root=repo, skip_render=True, skip_npm=True)

    def test_app_must_exist(self, repo: Path) -> None:
        with pytest.raises(ScaffoldError, match="Create the app first"):
            scaffold_mobile(slug="no-such-app", repo_root=repo, skip_render=True, skip_npm=True)

    def test_refuses_to_overwrite(self, repo: Path) -> None:
        _generate(repo)
        marker = _mobile_dir(repo) / "app" / "index.tsx"
        marker.write_text("edited", "utf-8")
        with pytest.raises(ScaffoldError, match="already exists"):
            _generate(repo)
        assert marker.read_text("utf-8") == "edited"

    def test_missing_template(self, repo: Path) -> None:
        shutil.rmtree(repo / "infra" / "templates" / "scaffold-mobile")
        with pytest.raises(ScaffoldError, match="templates missing"):
            _generate(repo)
