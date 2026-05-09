"""Shared git-commit resolver for deploy verification.

Both apps' ``main.py`` modules expose a ``GIT_COMMIT`` constant that powers
the ``/health`` and ``/version`` deploy-verification routes. The constant
resolves to (in order):

1. The ``GIT_COMMIT`` env var, set by the build pipeline at image build
   time (Docker build arg → env var).
2. ``git rev-parse --short HEAD`` from the working directory, useful in
   local dev runs.
3. The literal string ``"unknown"`` — last-resort fallback so the
   constant always resolves to a non-empty string.

This module is the single source of truth — both apps' ``main.py`` import
``resolve_git_commit`` instead of carrying their own copy.
"""
from __future__ import annotations

import os
import subprocess


def resolve_git_commit() -> str:
    """Return the deployed git commit short SHA, or ``"unknown"`` if unavailable.

    Read priority:
        1. ``$GIT_COMMIT`` env var (set by the build pipeline)
        2. ``git rev-parse --short HEAD`` (local dev fallback)
        3. ``"unknown"`` literal (last-resort fallback)

    Never raises — exceptions from the subprocess call are swallowed and
    the literal ``"unknown"`` is returned. Callers can rely on the result
    always being a non-empty string.
    """
    env_commit = os.environ.get("GIT_COMMIT", "").strip()
    if env_commit:
        return env_commit
    try:
        return subprocess.check_output(
            ["git", "rev-parse", "--short", "HEAD"],
            text=True,
            stderr=subprocess.DEVNULL,
        ).strip()
    except Exception:
        return "unknown"
