"""platform_shared.infra.mobile_lock: what generating a mobile app may do to the lockfile."""
from __future__ import annotations

import copy
import json
import subprocess
import sys
from pathlib import Path

import pytest

from platform_shared.infra.mobile_lock import lock_problems

_TEMPLATE = "infra/templates/scaffold-mobile"
_APP = "apps/demo/mobile"
_REPO_ROOT = Path(__file__).resolve().parents[3]
_NESTED = {"version": "1.0.0", "integrity": "sha512-a", "dev": True}
_TEMPLATE_DEPS = {"dependencies": {"expo": "~58"}, "devDependencies": {"jest": "^30"}}


@pytest.fixture
def before() -> dict[str, object]:
    return {
        "": {"workspaces": ["apps/*/mobile"]},
        "node_modules/react": {"version": "19.3.0", "integrity": "sha512-r"},
        _TEMPLATE: {"name": "scaffold-mobile-template", "version": "0.0.1", **_TEMPLATE_DEPS},
        f"{_TEMPLATE}/node_modules/jest-expo": _NESTED,
        f"{_TEMPLATE}/node_modules/jest-expo/node_modules/test-renderer": _NESTED,
    }


@pytest.fixture
def after(before: dict[str, object]) -> dict[str, object]:
    """A correct result: the app's workspace, its link and copies of the nested entries."""
    return {
        **copy.deepcopy(before),
        _APP: {"name": "demo-mobile", "version": "0.0.1", **_TEMPLATE_DEPS},
        "node_modules/demo-mobile": {"resolved": _APP, "link": True},
        f"{_APP}/node_modules/jest-expo": _NESTED,
        f"{_APP}/node_modules/jest-expo/node_modules/test-renderer": _NESTED,
    }


class TestLockProblems:
    def test_accepts_the_real_shape(self, before: dict, after: dict) -> None:
        assert lock_problems(before, after, "demo") == []

    def test_accepts_no_change_for_another_slug(self, before: dict) -> None:
        assert lock_problems(before, copy.deepcopy(before), "other") == []

    def test_rejects_a_nested_package_the_template_doesnt_have(self, before: dict, after: dict) -> None:
        after[f"{_APP}/node_modules/evil"] = {"version": "1.0.0", "resolved": "https://evil.example/x.tgz"}
        problems = lock_problems(before, after, "demo")
        assert len(problems) == 1
        assert "node_modules/evil" in problems[0]

    def test_rejects_a_nested_copy_with_other_content(self, before: dict, after: dict) -> None:
        after[f"{_APP}/node_modules/jest-expo"] = {**_NESTED, "integrity": "sha512-evil"}
        assert "jest-expo" in lock_problems(before, after, "demo")[0]

    def test_rejects_a_path_outside_node_modules(self, before: dict, after: dict) -> None:
        after[f"{_APP}/anything"] = {"version": "1.0.0"}
        assert "anything" in lock_problems(before, after, "demo")[0]

    @pytest.mark.parametrize(
        "manifest",
        [
            {"name": "demo-mobile", "dependencies": {"expo": "~58", "evil": "1"}, "devDependencies": {"jest": "^30"}},
            {"name": "demo-mobile", "dependencies": {"expo": "~58"}, "devDependencies": {}},
            {"name": "demo-mobile", "dependencies": {"expo": "~58"}, "devDependencies": {"jest": "^30"}, "peerDependencies": {"x": "1"}},
        ],
    )
    def test_rejects_an_app_whose_dependencies_differ(self, before: dict, after: dict, manifest: dict) -> None:
        after[_APP] = manifest
        assert "dependencies differ" in lock_problems(before, after, "demo")[0]

    def test_rejects_a_link_pointing_elsewhere(self, before: dict, after: dict) -> None:
        after["node_modules/demo-mobile"] = {"resolved": "somewhere/else", "link": True}
        assert "not a link" in lock_problems(before, after, "demo")[0]

    def test_rejects_a_bumped_package(self, before: dict, after: dict) -> None:
        after["node_modules/react"] = {"version": "19.2.0", "integrity": "sha512-r"}
        assert lock_problems(before, after, "demo") == ["node_modules/react: changed."]

    def test_rejects_a_removed_package(self, before: dict, after: dict) -> None:
        del after["node_modules/react"]
        assert lock_problems(before, after, "demo") == ["node_modules/react: changed."]

    @pytest.mark.parametrize(
        "key",
        ["node_modules/new-thing", "apps/demo2/mobile/node_modules/x", "apps/demo/mobile2/x"],
    )
    def test_rejects_an_addition_outside_the_app(self, before: dict, after: dict, key: str) -> None:
        after[key] = {"version": "1.0.0"}
        assert lock_problems(before, after, "demo") == [f"{key}: changed."]

    def test_rejects_a_change_to_the_root_entry(self, before: dict, after: dict) -> None:
        after[""] = {"workspaces": ["apps/*/mobile"], "devDependencies": {"evil": "1"}}
        assert lock_problems(before, after, "demo") == [": changed."]

    def test_rejects_a_change_to_the_template_itself(self, before: dict, after: dict) -> None:
        after[f"{_TEMPLATE}/node_modules/jest-expo"] = {**_NESTED, "integrity": "sha512-evil"}
        problems = lock_problems(before, after, "demo")
        assert f"{_TEMPLATE}/node_modules/jest-expo: changed." in problems


class TestCli:
    def _run(self, tmp_path: Path, before: dict, after: dict) -> subprocess.CompletedProcess[str]:
        (tmp_path / "before.json").write_text(json.dumps({"packages": before}), "utf-8")
        (tmp_path / "after.json").write_text(json.dumps({"packages": after}), "utf-8")
        return subprocess.run(
            [sys.executable, "-m", "platform_shared.infra.mobile_lock",
             str(tmp_path / "before.json"), str(tmp_path / "after.json"), "demo"],
            capture_output=True,
            text=True,
            cwd=_REPO_ROOT / "packages" / "shared-backend",
            check=False,
        )

    def test_exits_zero_when_clean(self, tmp_path: Path, before: dict, after: dict) -> None:
        assert self._run(tmp_path, before, after).returncode == 0

    def test_exits_one_and_names_the_package(self, tmp_path: Path, before: dict, after: dict) -> None:
        after[f"{_APP}/node_modules/evil"] = {"version": "1.0.0"}
        result = self._run(tmp_path, before, after)
        assert result.returncode == 1
        assert "node_modules/evil" in result.stderr
