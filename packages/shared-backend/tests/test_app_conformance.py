"""Conformance tests — fail CI when an app drifts from canonical patterns.

These tests guard the structural-parity contract documented in each app's
CLAUDE.md ("MJH mirrors MBK by default" / "anything NOT on the divergence
list, presume MBK is right and copy"). They check actual app source for
the patterns we extracted into platform_shared, so a future regression
where someone copy-pastes a private boot guard back into app code (the
exact pattern this Tier-1 series removed) fails CI before merge.

Each test is one assertion. The error message is the fix.

When a check legitimately *should* be allowed for one app, list its path
in the per-test allow-list with a comment explaining the divergence.
"""
from __future__ import annotations

import re
from pathlib import Path

import pytest

# Repo root, relative to this test file: tests/ -> shared-backend/ -> packages/ -> repo/
_REPO_ROOT = Path(__file__).resolve().parents[3]
_APPS = ["mybookkeeper", "myjobhunter"]


def _read(*parts: str) -> str:
    return (_REPO_ROOT.joinpath(*parts)).read_text(encoding="utf-8")


@pytest.mark.parametrize("app", _APPS)
class TestSettingsInheritsBaseAppSettings:
    """Each app's Settings class must inherit from BaseAppSettings.

    Drift trigger: someone subclasses pydantic.BaseSettings directly
    instead of platform_shared.core.settings.BaseAppSettings, which
    silently re-introduces every field that should be inherited.
    """

    def test_settings_subclass_imports_base(self, app: str) -> None:
        config_src = _read("apps", app, "backend", "app", "core", "config.py")
        assert "from platform_shared.core.settings import BaseAppSettings" in config_src, (
            f"{app}/backend/app/core/config.py must import BaseAppSettings "
            f"from platform_shared.core.settings — direct BaseSettings inheritance "
            f"violates the parity contract documented in CLAUDE.md."
        )
        assert "class Settings(BaseAppSettings)" in config_src, (
            f"{app}/backend/app/core/config.py: Settings class must inherit from "
            f"BaseAppSettings, not pydantic_settings.BaseSettings directly."
        )


@pytest.mark.parametrize("app", _APPS)
class TestNoLocalBootGuards:
    """Each app's main.py must NOT define its own _check_*_configured.

    The platform_shared.core.boot_guards module is the canonical home
    for boot-time fail-loud guards. Copy-pasting a private guard into
    app/main.py is the exact drift pattern this Tier-1 series removed
    (PRs #291–#293).
    """

    def test_no_private_check_turnstile_in_main(self, app: str) -> None:
        main_src = _read("apps", app, "backend", "app", "main.py")
        assert "_check_turnstile_configured" not in main_src, (
            f"{app}/backend/app/main.py defines a local _check_turnstile_configured. "
            f"Use platform_shared.core.boot_guards.check_turnstile_configured() instead. "
            f"See PR #292 for the canonical extraction pattern."
        )

    def test_no_private_init_sentry_in_main(self, app: str) -> None:
        """init_sentry MAY be imported from app.core.observability (the per-app
        wrapper) but must NOT be redefined inline in main.py."""
        main_src = _read("apps", app, "backend", "app", "main.py")
        # Match a function definition, not an import or call site
        local_def = re.search(r"^def\s+init_sentry\s*\(", main_src, re.MULTILINE)
        assert local_def is None, (
            f"{app}/backend/app/main.py defines init_sentry() locally. "
            f"Import from app.core.observability (which delegates to "
            f"platform_shared.core.observability.init_sentry). See PR #291."
        )


@pytest.mark.parametrize("app", _APPS)
class TestLifespanCallsSharedGuards:
    """Each app's lifespan must call all the shared boot guards.

    This is the parity contract: missing a guard in one app while having
    it in the other is the drift this series prevents.
    """

    def test_lifespan_calls_check_turnstile_configured(self, app: str) -> None:
        main_src = _read("apps", app, "backend", "app", "main.py")
        assert "check_turnstile_configured(" in main_src, (
            f"{app}/backend/app/main.py lifespan does not call "
            f"check_turnstile_configured(). Add it after init_sentry() — "
            f"production deploys without TURNSTILE_SECRET_KEY are a "
            f"credential-stuffing vulnerability."
        )

    def test_lifespan_calls_check_email_configured(self, app: str) -> None:
        main_src = _read("apps", app, "backend", "app", "main.py")
        assert "check_email_configured(" in main_src, (
            f"{app}/backend/app/main.py lifespan does not call "
            f"check_email_configured(). Add it after check_turnstile_configured() — "
            f"the 2026-05-05 Kenneth verification-email outage was caused by "
            f"console-mode email backend silently logging to stdout in "
            f"production."
        )

    def test_lifespan_calls_init_sentry(self, app: str) -> None:
        main_src = _read("apps", app, "backend", "app", "main.py")
        assert "init_sentry()" in main_src, (
            f"{app}/backend/app/main.py lifespan must call init_sentry() "
            f"to satisfy the production observability contract."
        )

    def test_lifespan_calls_register_audit_listeners(self, app: str) -> None:
        main_src = _read("apps", app, "backend", "app", "main.py")
        assert "register_audit_listeners(" in main_src, (
            f"{app}/backend/app/main.py lifespan must call "
            f"register_audit_listeners() — without it, no audit_log rows "
            f"get written for any model write."
        )


class TestLifespanGuardOrder:
    """Boot guards must run in a specific order so each one's preconditions
    are satisfied: Sentry first (so guard failures get captured), then the
    config guards in any order, then the side-effect inits."""

    @pytest.mark.parametrize("app", _APPS)
    def test_init_sentry_runs_before_check_turnstile(self, app: str) -> None:
        main_src = _read("apps", app, "backend", "app", "main.py")
        sentry_idx = main_src.find("init_sentry()")
        turnstile_idx = main_src.find("check_turnstile_configured(")
        assert 0 < sentry_idx < turnstile_idx, (
            f"{app}/backend/app/main.py: init_sentry() must run BEFORE "
            f"check_turnstile_configured() so any boot-guard failure is "
            f"captured by Sentry."
        )

    @pytest.mark.parametrize("app", _APPS)
    def test_init_sentry_runs_before_check_email(self, app: str) -> None:
        main_src = _read("apps", app, "backend", "app", "main.py")
        sentry_idx = main_src.find("init_sentry()")
        email_idx = main_src.find("check_email_configured(")
        assert 0 < sentry_idx < email_idx, (
            f"{app}/backend/app/main.py: init_sentry() must run BEFORE "
            f"check_email_configured() so any boot-guard failure is "
            f"captured by Sentry."
        )


@pytest.mark.parametrize("app", _APPS)
class TestObservabilityWrapperShape:
    """Each app's app/core/observability.py must be a thin wrapper around
    platform_shared.core.observability.init_sentry — not a re-implementation."""

    def test_wrapper_imports_shared(self, app: str) -> None:
        wrapper_src = _read("apps", app, "backend", "app", "core", "observability.py")
        assert "from platform_shared.core.observability import" in wrapper_src, (
            f"{app}/backend/app/core/observability.py must import from "
            f"platform_shared.core.observability — see PR #291 for the "
            f"canonical wrapper shape."
        )

    def test_wrapper_does_not_import_sentry_sdk_directly(self, app: str) -> None:
        wrapper_src = _read("apps", app, "backend", "app", "core", "observability.py")
        # Match an actual `import sentry_sdk` line — the wrapper must
        # delegate to the shared layer, not re-import sentry_sdk itself.
        # Skip comment lines so docstrings mentioning sentry_sdk don't
        # trigger a false-positive.
        for line in wrapper_src.splitlines():
            stripped = line.strip()
            if not stripped or stripped.startswith("#") or stripped.startswith('"""'):
                continue
            assert not stripped.startswith("import sentry_sdk"), (
                f"{app}/backend/app/core/observability.py imports sentry_sdk "
                f"directly. The wrapper must delegate to "
                f"platform_shared.core.observability — sentry_sdk should only "
                f"be imported there."
            )
            assert not stripped.startswith("from sentry_sdk"), (
                f"{app}/backend/app/core/observability.py imports from "
                f"sentry_sdk directly. Delegate to "
                f"platform_shared.core.observability."
            )
