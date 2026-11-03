"""platform_shared.infra.mobile_sync: web edits need a decision about mobile."""
from __future__ import annotations

import io
from pathlib import Path

import pytest
import yaml

from platform_shared.infra import mobile_sync, render

_REPO_ROOT = Path(__file__).resolve().parents[3]
_PAGE = "apps/recipes/frontend/src/pages/RecipeDetail.tsx"
_BUILT = "routes:\n  /recipes/:id:\n    screen: recipes/[id]\n"
_NOT_BUILT = "routes:\n  /recipes/:id:\n    not_on_mobile: Not built yet.\n"


def _app(root: Path, slug: str = "recipes", *, mobile: bool = True, screen_map: str | None = _BUILT) -> None:
    app_dir = root / "apps" / slug
    app_dir.mkdir(parents=True)
    (app_dir / "app.yaml").write_text(
        f"app_slug: {slug}\napp_display_name: X\nmobile: {str(mobile).lower()}\n", encoding="utf-8"
    )
    if screen_map is not None:
        (app_dir / "mobile").mkdir()
        (app_dir / "mobile" / "screen-map.yaml").write_text(screen_map, encoding="utf-8")


class TestCheckPullRequest:
    def test_web_edit_with_no_decision_fails_and_says_what_to_do(self, tmp_path: Path) -> None:
        _app(tmp_path)
        errors = mobile_sync.check_pull_request(tmp_path, [_PAGE], "")
        assert len(errors) == 1
        assert "apps/recipes/mobile" in errors[0]
        assert "Mobile: <why not>" in errors[0]

    def test_changing_the_mobile_app_in_the_same_pr_passes(self, tmp_path: Path) -> None:
        _app(tmp_path)
        changed = [_PAGE, "apps/recipes/mobile/app/recipes/[id].tsx"]
        assert mobile_sync.check_pull_request(tmp_path, changed, "") == []

    def test_changing_another_apps_mobile_code_does_not_count(self, tmp_path: Path) -> None:
        _app(tmp_path)
        changed = [_PAGE, "apps/recipes-two/mobile/app/index.tsx"]
        assert len(mobile_sync.check_pull_request(tmp_path, changed, "")) == 1

    @pytest.mark.parametrize(
        "body",
        [
            "Mobile: web-only admin table",
            "## Summary\nFixes a thing.\n\nMobile: no screen shows this\n",
            "  Mobile: indented is fine",
            "Mobile: web only\r\nNext line\r\n",
            "```\nsome code\n```\nMobile: web only",
        ],
    )
    def test_a_stated_reason_passes(self, tmp_path: Path, body: str) -> None:
        _app(tmp_path)
        assert mobile_sync.check_pull_request(tmp_path, [_PAGE], body) == []

    @pytest.mark.parametrize(
        "body",
        [
            "Mobile:",
            "Mobile:   \nNext line has words",
            "<!-- Mobile: <why not> -->",
            "<!--\nMobile: from the template\n-->",
            "Not touching Mobile: at all",
            "Mobile:\r\nNext line",
            "Mobile: <why not>",
            "Mobile: <why not>  \r\nNext line",
            "mobile: true",
            "```yaml\nMobile: true\n```",
            "<!-- never closed\nMobile: hidden from the reader",
            "```\nnever closed\nMobile: inside the code block",
        ],
    )
    def test_a_blank_or_commented_out_reason_fails(self, tmp_path: Path, body: str) -> None:
        _app(tmp_path)
        assert len(mobile_sync.check_pull_request(tmp_path, [_PAGE], body)) == 1

    @pytest.mark.parametrize(
        "path",
        [
            "apps/recipes/frontend/src/pages/__tests__/RecipeDetail.test.tsx",
            "apps/recipes/frontend/src/pages/RecipeDetail.spec.ts",
            "apps/recipes/frontend/e2e/recipe.spec.ts",
            "apps/recipes/frontend/package.json",
            "apps/recipes/backend/app/main.py",
            "packages/shared-frontend/src/index.ts",
        ],
    )
    def test_paths_that_are_not_web_source_are_ignored(self, tmp_path: Path, path: str) -> None:
        _app(tmp_path)
        assert mobile_sync.check_pull_request(tmp_path, [path], "") == []

    def test_app_with_no_built_screens_is_not_flagged(self, tmp_path: Path) -> None:
        _app(tmp_path, screen_map=_NOT_BUILT)
        assert mobile_sync.check_pull_request(tmp_path, [_PAGE], "") == []

    def test_app_without_mobile_is_not_flagged(self, tmp_path: Path) -> None:
        _app(tmp_path, mobile=False, screen_map=None)
        assert mobile_sync.check_pull_request(tmp_path, [_PAGE], "") == []

    def test_app_deleted_by_the_pr_is_not_flagged(self, tmp_path: Path) -> None:
        assert mobile_sync.check_pull_request(tmp_path, [_PAGE], "") == []

    def test_each_app_is_reported(self, tmp_path: Path) -> None:
        _app(tmp_path)
        _app(tmp_path, "pizza")
        changed = [_PAGE, "apps/pizza/frontend/src/App.tsx"]
        assert len(mobile_sync.check_pull_request(tmp_path, changed, "")) == 2

    @pytest.mark.parametrize("screen_map", [None, "routes: [", "routes: nope\n"])
    def test_unreadable_screen_map_fails_instead_of_skipping(
        self, tmp_path: Path, screen_map: str | None
    ) -> None:
        _app(tmp_path, screen_map=screen_map)
        assert len(mobile_sync.check_pull_request(tmp_path, [_PAGE], "")) == 1


class TestCli:
    def _run(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch, stdin: str, body: str | None) -> int:
        monkeypatch.setattr(render, "_repo_root", lambda: tmp_path)
        monkeypatch.setattr("sys.stdin", io.StringIO(stdin))
        if body is None:
            monkeypatch.delenv("PR_BODY", raising=False)
        else:
            monkeypatch.setenv("PR_BODY", body)
        return mobile_sync._cli()

    def test_fails_and_prints_on_a_missing_decision(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
    ) -> None:
        _app(tmp_path)
        assert self._run(tmp_path, monkeypatch, f"{_PAGE}\0README.md\0", None) == 1
        assert "Mobile: <why not>" in capsys.readouterr().err

    def test_passes_with_a_reason_in_the_description(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _app(tmp_path)
        assert self._run(tmp_path, monkeypatch, f"{_PAGE}\0", "Mobile: web only") == 0

    def test_passes_on_no_changes(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        assert self._run(tmp_path, monkeypatch, "", "") == 0


class TestWorkflow:
    """Each of these settings is load-bearing, and dropping one wouldn't fail anything."""

    _WORKFLOW = yaml.safe_load(
        (_REPO_ROOT / ".github" / "workflows" / "mobile-sync.yml").read_text(encoding="utf-8")
    )

    def test_reruns_when_the_description_is_edited(self) -> None:
        # PyYAML reads the bare key `on` as True.
        assert "edited" in self._WORKFLOW[True]["pull_request"]["types"]

    def test_has_no_path_filter(self) -> None:
        assert "paths" not in self._WORKFLOW[True]["pull_request"]

    def test_can_see_the_commit_it_diffs_against(self) -> None:
        checkout = self._WORKFLOW["jobs"]["mobile-sync"]["steps"][0]
        assert checkout["with"]["fetch-depth"] == 2

    def test_description_reaches_the_script_through_the_environment(self) -> None:
        """Written into `run:` directly, a PR description could run shell commands."""
        step = self._WORKFLOW["jobs"]["mobile-sync"]["steps"][-1]
        assert step["shell"] == "bash"
        assert "PR_BODY" in step["env"]
        assert "${{" not in step["run"]
