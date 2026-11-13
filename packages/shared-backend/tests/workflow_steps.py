"""Reads GitHub Actions workflows for the CI conformance tests. Not a test module.

Shared by the tests that assert a workflow runs some command in a step that can actually fail it
(test_e2e_typecheck.py, test_web_scaffold_e2e.py).
"""

from __future__ import annotations

import yaml


def _is_literally_false(condition: object) -> bool:
    if condition is False:
        return True
    if not isinstance(condition, str):
        return False
    text = condition.strip()
    if text.startswith("${{") and text.endswith("}}"):
        text = text[3:-2].strip()
    return text.strip("'\"").lower() == "false"


def cannot_fail(entry: dict[str, object]) -> bool:
    return entry.get("continue-on-error") is True or _is_literally_false(entry.get("if"))


def _run_lines(step: dict[str, object]) -> list[str]:
    """The shell lines a step runs, without shell comments."""
    run = step.get("run") or ""
    assert isinstance(run, str)
    return [line.strip() for line in run.splitlines() if not line.strip().startswith("#")]


def _workflow_steps(source: str) -> list[tuple[dict[str, object], dict[str, object]]]:
    """Every (job, step) pair in a workflow. YAML comments are dropped by the parser."""
    workflow = yaml.safe_load(source)
    return [
        (job, step)
        for job in (workflow.get("jobs") or {}).values()
        for step in job.get("steps") or []
    ]


def steps_running(source: str, command: str) -> list[tuple[dict[str, object], dict[str, object]]]:
    return [(job, step) for job, step in _workflow_steps(source) if command in _run_lines(step)]
