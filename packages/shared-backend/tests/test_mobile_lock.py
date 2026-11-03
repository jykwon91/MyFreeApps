"""platform_shared.infra.mobile_lock: a new app starts at the versions already locked."""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from platform_shared.infra import mobile_lock, render
from platform_shared.infra.new_app import ScaffoldError

_TEMPLATE = "infra/templates/scaffold-mobile"
_APP = "apps/demo/mobile"
_REPO_ROOT = Path(__file__).resolve().parents[3]
_NESTED = {"version": "1.0.0", "integrity": "sha512-a", "dev": True}
_PACKAGES = {
    "": {"workspaces": ["apps/*/mobile"]},
    "node_modules/react": {"version": "19.3.0", "integrity": "sha512-r"},
    _TEMPLATE: {"name": "scaffold-mobile-template", "version": "0.0.1", "dependencies": {"expo": "~58"}},
    f"{_TEMPLATE}/node_modules/jest-expo": _NESTED,
    f"{_TEMPLATE}/node_modules/jest-expo/node_modules/test-renderer": _NESTED,
    "infra/templates/scaffold-mobile-other/node_modules/x": _NESTED,
}


class TestWithApp:
    def test_adds_the_workspace_its_link_and_copies_of_the_nested_entries(self) -> None:
        added = {k: v for k, v in mobile_lock.with_app(_PACKAGES, "demo").items() if k not in _PACKAGES}
        assert added == {
            _APP: {"name": "demo-mobile", "version": "0.0.1", "dependencies": {"expo": "~58"}},
            "node_modules/demo-mobile": {"resolved": _APP, "link": True},
            f"{_APP}/node_modules/jest-expo": _NESTED,
            f"{_APP}/node_modules/jest-expo/node_modules/test-renderer": _NESTED,
        }

    def test_changes_nothing_already_there(self) -> None:
        result = mobile_lock.with_app(_PACKAGES, "demo")
        assert {k: result[k] for k in _PACKAGES} == _PACKAGES

    def test_a_lockfile_without_the_template_fails(self) -> None:
        with pytest.raises(ScaffoldError, match="npm install"):
            mobile_lock.with_app({"": {}}, "demo")

    def test_the_real_lockfile_has_nested_entries_to_copy(self) -> None:
        """Those are the packages npm would resolve again, which is what this exists for."""
        packages = json.loads((_REPO_ROOT / "package-lock.json").read_text("utf-8"))["packages"]
        result = mobile_lock.with_app(packages, "demo")
        assert result[f"{_APP}/node_modules/expo-router"] == packages[f"{_TEMPLATE}/node_modules/expo-router"]


class TestAddAppToLockfile:
    @pytest.fixture
    def lockfile(self, tmp_path: Path) -> Path:
        path = tmp_path / "package-lock.json"
        path.write_text(json.dumps({"lockfileVersion": 3, "packages": _PACKAGES}), "utf-8")
        self._manifest(tmp_path, {"name": "demo-mobile", "dependencies": {"expo": "~58"}})
        return path

    def _manifest(self, root: Path, manifest: dict[str, object]) -> None:
        mobile = root / _APP
        mobile.mkdir(parents=True, exist_ok=True)
        (mobile / "package.json").write_text(json.dumps(manifest), "utf-8")

    def test_writes_the_entries_and_keeps_the_rest(self, tmp_path: Path, lockfile: Path) -> None:
        mobile_lock.add_app_to_lockfile(tmp_path, "demo")
        lock = json.loads(lockfile.read_text("utf-8"))
        assert lock["lockfileVersion"] == 3
        assert lock["packages"][_APP]["name"] == "demo-mobile"

    @pytest.mark.parametrize(
        "manifest",
        [
            {"name": "demo-mobile"},
            {"name": "demo-mobile", "dependencies": {"expo": "^58"}},
            {"name": "demo-mobile", "dependencies": {"expo": "~58"}, "devDependencies": {"x": "1"}},
            {"name": "demo-mobile", "devDependencies": {"expo": "~58"}},
        ],
    )
    def test_a_manifest_that_differs_from_the_lock_fails_and_writes_nothing(
        self, tmp_path: Path, lockfile: Path, manifest: dict[str, object]
    ) -> None:
        self._manifest(tmp_path, manifest)
        before = lockfile.read_text("utf-8")
        with pytest.raises(ScaffoldError, match="differs"):
            mobile_lock.add_app_to_lockfile(tmp_path, "demo")
        assert lockfile.read_text("utf-8") == before

    @pytest.mark.parametrize("content", ["<<<<<<< HEAD\n{", "{}", '{"packages": []}'])
    def test_an_unusable_lockfile_is_a_scaffold_error(self, tmp_path: Path, lockfile: Path, content: str) -> None:
        lockfile.write_text(content, "utf-8")
        with pytest.raises(ScaffoldError):
            mobile_lock.add_app_to_lockfile(tmp_path, "demo")

    def test_a_missing_lockfile_is_a_scaffold_error(self, tmp_path: Path) -> None:
        with pytest.raises(ScaffoldError):
            mobile_lock.add_app_to_lockfile(tmp_path, "demo")


class TestCli:
    def _run(self, root: Path, monkeypatch: pytest.MonkeyPatch, slug: str) -> int:
        monkeypatch.setattr(render, "_repo_root", lambda: root)
        monkeypatch.setattr("sys.argv", ["mobile_lock", slug])
        return mobile_lock._cli()

    def test_uses_the_repo_root(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        path = tmp_path / "package-lock.json"
        path.write_text(json.dumps({"packages": _PACKAGES}), "utf-8")
        (tmp_path / _APP).mkdir(parents=True)
        (tmp_path / _APP / "package.json").write_text(json.dumps({"dependencies": {"expo": "~58"}}), "utf-8")
        assert self._run(tmp_path, monkeypatch, "demo") == 0
        assert _APP in json.loads(path.read_text("utf-8"))["packages"]

    def test_failure_is_a_message_not_a_traceback(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
    ) -> None:
        assert self._run(tmp_path, monkeypatch, "demo") == 2
        assert capsys.readouterr().err.startswith("error:")

    def test_rejects_a_slug_that_would_escape_apps(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        path = tmp_path / "package-lock.json"
        path.write_text(json.dumps({"packages": _PACKAGES}), "utf-8")
        before = path.read_text("utf-8")
        assert self._run(tmp_path, monkeypatch, "../../evil") == 2
        assert path.read_text("utf-8") == before
