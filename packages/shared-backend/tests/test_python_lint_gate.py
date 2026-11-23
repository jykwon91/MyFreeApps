"""The Python lint CI gate must cover every backend and use the pre-commit ruff version."""
from __future__ import annotations

import re
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[3]
_WORKFLOW = _REPO_ROOT / ".github" / "workflows" / "ci-python-lint.yml"
_PRE_COMMIT = _REPO_ROOT / ".pre-commit-config.yaml"

# Backends still carrying pyflakes errors; remove an entry here once it is clean
# and its path has been added to the workflow.
_EXEMPT_BACKENDS = {"apps/mygamingassistant/backend"}


def _workflow_text() -> str:
    """Workflow source without comment lines, so prose in comments cannot satisfy or break a check."""
    lines = _WORKFLOW.read_text(encoding="utf-8").splitlines()
    return "\n".join(line for line in lines if not line.lstrip().startswith("#"))


def test_workflow_runs_on_every_pull_request_without_a_path_filter() -> None:
    assert "paths:" not in _workflow_text()


def test_ruff_version_matches_pre_commit() -> None:
    pinned = re.search(r"pip install ruff==(\d+\.\d+\.\d+)", _workflow_text())
    assert pinned, "ci-python-lint.yml must pin ruff with pip install ruff==X.Y.Z"
    pre_commit = re.search(r"ruff-pre-commit\s+rev: v(\d+\.\d+\.\d+)", _PRE_COMMIT.read_text(encoding="utf-8"))
    assert pre_commit, ".pre-commit-config.yaml must pin ruff-pre-commit"
    assert pinned.group(1) == pre_commit.group(1)


def test_every_backend_is_linted_or_explicitly_exempt() -> None:
    text = _workflow_text()
    backends = {
        f"apps/{p.parent.parent.name}/backend"
        for p in (_REPO_ROOT / "apps").glob("*/backend/pyproject.toml")
    }
    missing = {b for b in backends if b not in text} - _EXEMPT_BACKENDS
    assert not missing, f"backends not linted by ci-python-lint.yml: {sorted(missing)}"
    for exempt in _EXEMPT_BACKENDS:
        assert exempt not in text, f"{exempt} is linted now; drop it from _EXEMPT_BACKENDS"


def test_shared_backend_and_scaffold_templates_are_linted() -> None:
    text = _workflow_text()
    assert "packages/shared-backend" in text
    assert "infra/templates" in text
