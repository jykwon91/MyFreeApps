"""platform_shared.infra.new_mobile: generating apps/<slug>/mobile from the scaffold."""
from __future__ import annotations

import json
import re
import shutil
from pathlib import Path

import pytest
import yaml

from platform_shared.infra import new_app, new_mobile, render
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


class TestDisplayNameEscaping:
    _NAME = """Bob's "Apps" \\ <x> {y} é"""

    @pytest.fixture
    def generated(self, repo: Path) -> Path:
        app_yaml = repo / "apps" / _SLUG / "app.yaml"
        config = yaml.safe_load(app_yaml.read_text("utf-8"))
        config["app_display_name"] = self._NAME
        app_yaml.write_text(yaml.safe_dump(config, allow_unicode=True), "utf-8")
        _generate(repo)
        return _mobile_dir(repo)

    def test_app_json_keeps_the_name(self, generated: Path) -> None:
        assert json.loads((generated / "app.json").read_text("utf-8"))["expo"]["name"] == self._NAME

    @pytest.mark.parametrize("file", ["app/index.tsx", "__tests__/index.test.tsx"])
    def test_source_holds_it_as_one_js_string(self, generated: Path, file: str) -> None:
        # A JSON string is a valid JS string, so this reads it back the way JS would.
        source = (generated / file).read_text("utf-8")
        strings = [json.loads(m) for m in re.findall(r'"(?:[^"\\]|\\.)*"', source)]
        assert self._NAME in strings

    def test_template_only_uses_the_name_where_escaping_applies(self) -> None:
        index = (_TEMPLATES / "scaffold-mobile" / "app" / "index.tsx").read_text("utf-8")
        assert 'heading={"__APP_DISPLAY_NAME__"}' in index


class TestFailureLeavesNothingBehind:
    def _tree(self, repo: Path) -> dict[str, bytes]:
        return {
            p.relative_to(repo).as_posix(): p.read_bytes()
            for root in (repo / "apps", repo / ".github")
            if root.exists()
            for p in root.rglob("*")
            if p.is_file()
        }

    def _assert_unchanged(self, repo: Path, before: dict[str, bytes]) -> None:
        assert self._tree(repo) == before
        leftovers = [p.name for p in (repo / "apps" / _SLUG).iterdir() if "mobile" in p.name]
        assert leftovers == []

    def test_incomplete_app_yaml_at_render(self, repo: Path) -> None:
        app_yaml = repo / "apps" / _SLUG / "app.yaml"
        app_yaml.write_text(f"# Keep.\napp_slug: {_SLUG}\napp_display_name: X\n", "utf-8")
        before = self._tree(repo)

        with pytest.raises(ScaffoldError, match="nothing changed.*is undefined"):
            _generate(repo, skip_render=False)

        self._assert_unchanged(repo, before)

    def test_writing_a_workflow_fails_partway(
        self, repo: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        # Every workflow is written, then this fails: the rollback has real work to do.
        _generate(repo, skip_render=False)
        shutil.rmtree(_mobile_dir(repo))
        app_yaml = repo / "apps" / _SLUG / "app.yaml"
        app_yaml.write_text(app_yaml.read_text("utf-8").replace("mobile: true\n", ""), "utf-8")
        (repo / ".github" / "workflows" / f"ci-mobile-{_SLUG}.yml").unlink()
        before = self._tree(repo)
        real_render = render.render_app

        def fail_after_writing(root: Path, slug: str, *, write: bool) -> dict[str, tuple[str, str]]:
            results = real_render(root, slug, write=write)
            if write:
                raise OSError("disk full")
            return results

        monkeypatch.setattr(render, "render_app", fail_after_writing)
        with pytest.raises(ScaffoldError, match="disk full"):
            _generate(repo, skip_render=False)

        self._assert_unchanged(repo, before)

    def test_copying_the_template_fails_partway(
        self, repo: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        before = self._tree(repo)

        def fail(*_args: object, **_kwargs: object) -> int:
            raise OSError("disk full")

        monkeypatch.setattr(new_app, "_walk_and_copy", fail)
        with pytest.raises(ScaffoldError, match="disk full"):
            _generate(repo)

        self._assert_unchanged(repo, before)

    def test_unreadable_web_routes(self, repo: Path) -> None:
        routes = repo / "apps" / _SLUG / "frontend" / "src" / "routes.tsx"
        routes.write_text("<Route path={route.path} />", "utf-8")
        before = self._tree(repo)

        with pytest.raises(ScaffoldError, match="route.path"):
            _generate(repo)

        self._assert_unchanged(repo, before)

    def test_missing_display_name_says_so(self, repo: Path) -> None:
        app_yaml = repo / "apps" / _SLUG / "app.yaml"
        app_yaml.write_text(f"app_slug: {_SLUG}\n", "utf-8")
        before = self._tree(repo)

        with pytest.raises(ScaffoldError, match="must set `app_display_name`"):
            _generate(repo)

        self._assert_unchanged(repo, before)

    def test_app_yaml_for_another_slug(self, repo: Path) -> None:
        (repo / "apps" / _SLUG / "app.yaml").write_text("app_slug: other\n", "utf-8")
        with pytest.raises(ScaffoldError, match="Can't read"):
            _generate(repo)


class TestIdentifiers:
    def _add_app(self, repo: Path, slug: str) -> None:
        app_dir = repo / "apps" / slug
        app_dir.mkdir(parents=True)
        (app_dir / "app.yaml").write_text(f"app_slug: {slug}\napp_display_name: X\n", "utf-8")

    def test_rejects_a_slug_that_shares_a_bundle_id(self, repo: Path) -> None:
        self._add_app(repo, "myrecipes")
        scaffold_mobile(slug="myrecipes", repo_root=repo, skip_render=True, skip_npm=True)
        with pytest.raises(ScaffoldError, match="share the bundle ID org.myfreeapps.myrecipes"):
            _generate(repo)
        assert not _mobile_dir(repo).exists()

    def test_allows_that_slug_if_the_other_app_has_no_mobile_code(self, repo: Path) -> None:
        self._add_app(repo, "myrecipes")
        _generate(repo)
        assert _mobile_dir(repo).is_dir()

    @pytest.mark.parametrize("slug", ["class", "new", "cl-ass", "pack-age"])
    def test_rejects_a_java_keyword(self, repo: Path, slug: str) -> None:
        self._add_app(repo, slug)
        with pytest.raises(ScaffoldError, match="reserved word in Java"):
            scaffold_mobile(slug=slug, repo_root=repo, skip_render=True, skip_npm=True)
        assert not (repo / "apps" / slug / "mobile").exists()

    def test_rejects_a_keyword_only_after_removing_hyphens(self) -> None:
        assert new_mobile._scheme_for("cl-ass") == "class"


class TestTokens:
    def test_a_token_with_no_value_raises(self) -> None:
        with pytest.raises(KeyError, match="__API_PORT__"):
            new_app._substitute("x", {"__APP_DISPLAY_NAME__": "a", "__APP_SLUG__": "b"})

    def test_a_mobile_token_with_no_value_raises(self) -> None:
        with pytest.raises(KeyError, match="__APP_SCHEME__"):
            new_app._substitute(
                "x", {"__APP_DISPLAY_NAME__": "a", "__APP_SLUG__": "b"}, new_mobile._TOKENS
            )

    def test_the_web_scaffold_still_substitutes_every_token(self) -> None:
        replacements = {token: "v" for token in new_app._TOKEN_ORDER}
        assert new_app._substitute(" ".join(new_app._TOKEN_ORDER), replacements) == "v v v v v"


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


class TestLockfileStep:
    def _lock(self, repo: Path) -> None:
        manifest = json.loads((_TEMPLATES / "scaffold-mobile" / "package.json").read_text("utf-8"))
        entry = {"name": manifest["name"], "version": manifest["version"]}
        entry.update({k: manifest[k] for k in ("dependencies", "devDependencies")})
        (repo / "package-lock.json").write_text(
            json.dumps({"packages": {"infra/templates/scaffold-mobile": entry}}), "utf-8"
        )

    def test_copies_locked_versions_before_npm_runs(
        self, repo: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """npm must find the entries already there, or it resolves newer versions."""
        self._lock(repo)
        seen: list[bool] = []

        def fake_install(root: Path) -> bool:
            packages = json.loads((root / "package-lock.json").read_text("utf-8"))["packages"]
            seen.append(f"apps/{_SLUG}/mobile" in packages)
            return True

        monkeypatch.setattr(new_app, "_maybe_npm_install", fake_install)
        summary = scaffold_mobile(slug=_SLUG, repo_root=repo, skip_render=True, skip_npm=False)
        assert seen == [True]
        assert summary["npm_install_succeeded"] is True

    @pytest.mark.parametrize("content", [None, "<<<<<<< HEAD", '{"packages": {}}'])
    def test_a_bad_lockfile_undoes_everything_so_a_rerun_works(
        self, repo: Path, monkeypatch: pytest.MonkeyPatch, content: str | None
    ) -> None:
        app_yaml = repo / "apps" / _SLUG / "app.yaml"
        before = app_yaml.read_text("utf-8")
        monkeypatch.setattr(new_app, "_maybe_npm_install", lambda root: True)
        if content is not None:
            (repo / "package-lock.json").write_text(content, "utf-8")

        with pytest.raises(ScaffoldError, match="nothing changed"):
            scaffold_mobile(slug=_SLUG, repo_root=repo, skip_render=True, skip_npm=False)
        assert not _mobile_dir(repo).exists()
        assert app_yaml.read_text("utf-8") == before

        self._lock(repo)
        scaffold_mobile(slug=_SLUG, repo_root=repo, skip_render=True, skip_npm=False)
        assert _mobile_dir(repo).is_dir()


class TestLockfileWarnings:
    def _run(self, repo: Path, monkeypatch: pytest.MonkeyPatch, *flags: str) -> int:
        monkeypatch.setattr("sys.argv", ["new_mobile", _SLUG, "--skip-render", *flags])
        monkeypatch.setattr(new_app, "_repo_root", lambda: repo)
        return new_mobile._cli()

    def test_skip_npm_says_to_copy_locked_versions_first(
        self, repo: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
    ) -> None:
        assert self._run(repo, monkeypatch, "--skip-npm") == 0
        out = capsys.readouterr().out
        assert out.index("platform_shared.infra.mobile_lock") < out.index("npm install")
