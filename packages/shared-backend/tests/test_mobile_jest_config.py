"""Every phone app's jest config keeps the shared test setup the scaffold ships.

A setup file the template lists but an app's jest.config.js doesn't is a quiet regression: the
app's tests run, and the problem the file fixes comes back. The reset of each test file's RTK
Query stores is the case that prompted this: without it the Jest workers are force-exited with
"A worker process has failed to exit gracefully", and the pending timers make suites flaky.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

_REPO_ROOT = Path(__file__).resolve().parents[3]
_TEMPLATE = _REPO_ROOT / "infra" / "templates" / "scaffold-mobile" / "jest.config.js"
_APP_CONFIGS = sorted(_REPO_ROOT.glob("apps/*/mobile/jest.config.js"))
_SHARED_SETUP = re.compile(r"packages/shared-mobile/(?:jest|test-support)/[\w./-]+")
_COMMENT = re.compile(r"/\*.*?\*/|//[^\n]*", re.DOTALL)


def _listed_setup_files(source: str) -> set[str]:
    """The shared setup files a jest config names outside its comments."""
    return set(_SHARED_SETUP.findall(_COMMENT.sub("", source)))


def _shared_setup_files(config: Path) -> set[str]:
    return _listed_setup_files(config.read_text(encoding="utf-8"))


def test_a_commented_out_entry_does_not_count_as_listed() -> None:
    source = """
    setupFilesAfterEnv: [
      // "<rootDir>/../../../packages/shared-mobile/test-support/commentedLine.ts",
      /* "<rootDir>/../../../packages/shared-mobile/test-support/commentedBlock.ts", */
      "<rootDir>/../../../packages/shared-mobile/test-support/listed.ts",
    ],
    """
    assert _listed_setup_files(source) == {"packages/shared-mobile/test-support/listed.ts"}


def test_template_lists_the_shared_setup_files() -> None:
    listed = _shared_setup_files(_TEMPLATE)
    assert "packages/shared-mobile/test-support/resetStoresAfterAll.ts" in listed, (
        f"{_TEMPLATE.relative_to(_REPO_ROOT)} must list resetStoresAfterAll.ts, or every new app "
        "starts with Jest workers that can't exit."
    )
    assert "packages/shared-mobile/test-support/flushTimersAfterEach.ts" in listed


def test_there_are_phone_apps_to_check() -> None:
    assert _APP_CONFIGS, "No apps/*/mobile/jest.config.js found, so the check below would pass on nothing."


@pytest.mark.parametrize("config", _APP_CONFIGS, ids=lambda path: path.parents[1].name)
def test_app_lists_every_shared_setup_file_the_template_does(config: Path) -> None:
    missing = _shared_setup_files(_TEMPLATE) - _shared_setup_files(config)
    assert not missing, (
        f"{config.relative_to(_REPO_ROOT)} is missing shared jest setup that "
        f"infra/templates/scaffold-mobile/jest.config.js lists: {sorted(missing)}. "
        "Add them to its setupFiles / setupFilesAfterEnv."
    )


def test_shared_mobile_resets_its_own_stores() -> None:
    # No flushTimersAfterEach here: it keeps the one store an app's screens share across a file's tests
    # hearing updates, and shared-mobile's tests each build their own store.
    config = (_REPO_ROOT / "packages" / "shared-mobile" / "jest.config.js").read_text(encoding="utf-8")
    assert "test-support/resetStoresAfterAll.ts" in config
