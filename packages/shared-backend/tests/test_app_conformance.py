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
class TestLifespanUsesSharedFactory:
    """Each app's lifespan must be built via the shared
    ``create_app_lifespan`` factory rather than a hand-rolled
    ``@asynccontextmanager`` that re-implements the canonical boot
    sequence.

    This is the parity contract: the boot order (sentry, turnstile,
    email, audit, bucket) is centralised in
    ``platform_shared.core.lifespan`` and unit-tested there. App
    main.py files just compose the factory with their settings + an
    optional bucket_init / on_startup / on_shutdown.
    """

    def test_imports_create_app_lifespan(self, app: str) -> None:
        main_src = _read("apps", app, "backend", "app", "main.py")
        assert "from platform_shared.core.lifespan import create_app_lifespan" in main_src, (
            f"{app}/backend/app/main.py must import create_app_lifespan "
            f"from platform_shared.core.lifespan — see PR #301 for the "
            f"canonical lifespan composition pattern."
        )

    def test_calls_create_app_lifespan(self, app: str) -> None:
        main_src = _read("apps", app, "backend", "app", "main.py")
        assert "create_app_lifespan(" in main_src, (
            f"{app}/backend/app/main.py must build its lifespan via "
            f"create_app_lifespan(...) instead of a hand-rolled "
            f"@asynccontextmanager."
        )

    def test_passes_settings_to_factory(self, app: str) -> None:
        main_src = _read("apps", app, "backend", "app", "main.py")
        assert "settings=settings" in main_src, (
            f"{app}/backend/app/main.py must pass settings=settings to "
            f"create_app_lifespan so the boot guards can read sentry_dsn, "
            f"turnstile_secret_key, and email_backend."
        )

    def test_passes_init_sentry_to_factory(self, app: str) -> None:
        main_src = _read("apps", app, "backend", "app", "main.py")
        assert "init_sentry=init_sentry" in main_src, (
            f"{app}/backend/app/main.py must pass init_sentry=init_sentry "
            f"to create_app_lifespan. The wrapper from "
            f"app.core.observability binds settings.sentry_dsn / "
            f"settings.environment internally."
        )

    def test_passes_bucket_init_to_factory(self, app: str) -> None:
        """Both apps use MinIO and should wire ensure_bucket through
        the factory's bucket_init parameter so the canonical boot
        order (sentry → guards → audit → bucket → app-startup) is
        enforced."""
        main_src = _read("apps", app, "backend", "app", "main.py")
        assert "bucket_init=ensure_bucket" in main_src, (
            f"{app}/backend/app/main.py must pass "
            f"bucket_init=ensure_bucket to create_app_lifespan."
        )

    def test_does_not_define_local_lifespan(self, app: str) -> None:
        """The hand-rolled `async def lifespan(...)` was the drift surface
        this Tier-1 series eliminated. Apps must NOT redefine it."""
        main_src = _read("apps", app, "backend", "app", "main.py")
        # Match a function definition that opens a lifespan
        local_def = re.search(
            r"^async\s+def\s+lifespan\s*\(",
            main_src,
            re.MULTILINE,
        )
        assert local_def is None, (
            f"{app}/backend/app/main.py defines a local async lifespan(). "
            f"Use create_app_lifespan() from platform_shared instead. "
            f"App-specific startup/shutdown belongs in on_startup / "
            f"on_shutdown hooks passed to the factory."
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


@pytest.mark.parametrize("app", _APPS)
class TestTurnstileBundleWiring:
    """The 2026-05-05 silent-registration-broken bug: VITE_TURNSTILE_SITE_KEY
    was missing from the docker-compose build-arg → caddy.Dockerfile ARG path,
    so every production bundle was built with an empty site key and the
    TurnstileWidget rendered null. Backend rejected every registration with
    400 captcha_token_required.

    This conformance check fails CI if either the Dockerfile ARG or the
    docker-compose build-args wiring is missing — preventing the same drift.

    Note: this is a structural conformance check, NOT a bundle smoke test.
    The bundle smoke test (e.g. an E2E that asserts a Turnstile widget
    renders on the registration page) is a separate follow-up tracked in
    the broader test backlog.
    """

    def test_caddy_dockerfile_declares_turnstile_arg(self, app: str) -> None:
        """The frontend build stage in caddy.Dockerfile must declare ARG +
        ENV for VITE_TURNSTILE_SITE_KEY before the `npm run build` line."""
        dockerfile_src = _read("apps", app, "docker", "caddy.Dockerfile")
        assert "ARG VITE_TURNSTILE_SITE_KEY" in dockerfile_src, (
            f"{app}/docker/caddy.Dockerfile must declare "
            f"`ARG VITE_TURNSTILE_SITE_KEY=` before `RUN npm run build` "
            f"so docker-compose can pass the public Turnstile site key "
            f"into the Vite bundle. Without this, the bundle is built "
            f"with an empty key, TurnstileWidget renders null, and "
            f"registration silently 400s in production."
        )
        assert "ENV VITE_TURNSTILE_SITE_KEY" in dockerfile_src, (
            f"{app}/docker/caddy.Dockerfile must set "
            f"`ENV VITE_TURNSTILE_SITE_KEY=${{VITE_TURNSTILE_SITE_KEY}}` "
            f"after the ARG declaration so Vite picks up the value at "
            f"build time."
        )
        # The ARG/ENV must come BEFORE the npm run build line, otherwise
        # the build runs with no env set.
        arg_idx = dockerfile_src.find("ARG VITE_TURNSTILE_SITE_KEY")
        build_idx = dockerfile_src.find("npm run build")
        assert 0 < arg_idx < build_idx, (
            f"{app}/docker/caddy.Dockerfile: ARG VITE_TURNSTILE_SITE_KEY "
            f"must be declared BEFORE `RUN npm run build`, otherwise "
            f"Vite runs without the env value."
        )

    def test_docker_compose_passes_turnstile_arg_to_caddy(self, app: str) -> None:
        """The caddy service in docker-compose.yml must declare a
        build.args block that maps VITE_TURNSTILE_SITE_KEY from the shell
        env (where the operator / deploy workflow sources backend/.env.docker)."""
        compose_src = _read("apps", app, "docker-compose.yml")
        assert "VITE_TURNSTILE_SITE_KEY:" in compose_src, (
            f"{app}/docker-compose.yml must include `VITE_TURNSTILE_SITE_KEY: "
            f"${{TURNSTILE_SITE_KEY:-}}` under the caddy service's "
            f"`build.args:` block. Without this, the caddy.Dockerfile's "
            f"ARG sees no value at build time and the bundle is baked "
            f"with an empty Turnstile site key."
        )
        assert "${TURNSTILE_SITE_KEY" in compose_src, (
            f"{app}/docker-compose.yml: VITE_TURNSTILE_SITE_KEY build "
            f"arg must reference ${{TURNSTILE_SITE_KEY}} (no VITE_ "
            f"prefix on the right-hand side) so docker compose reads "
            f"the value from the same env var name the backend uses."
        )

    def test_deploy_workflow_uses_env_file_for_build(self, app: str) -> None:
        """The deploy workflow must pass `--env-file backend/.env.docker`
        to `docker compose build` so the build-args block can resolve
        TURNSTILE_SITE_KEY from the env file."""
        workflow_src = _read(".github", "workflows", f"deploy-{app}.yml")
        # Match a `docker compose ... --env-file ...backend/.env.docker ... build`
        # invocation, allowing shell line-continuations (backslash + newline)
        # between the segments. Re-DOTALL lets `.` cross newlines so the
        # wrapped multi-line form in the workflow is matched.
        match = re.search(
            r"docker\s+compose.*?--env-file.*?backend/\.env\.docker.*?\bbuild\b",
            workflow_src,
            re.DOTALL,
        )
        assert match is not None, (
            f".github/workflows/deploy-{app}.yml must invoke "
            f"`docker compose --env-file apps/{app}/backend/.env.docker "
            f"... build` so TURNSTILE_SITE_KEY (and other build-time env "
            f"vars) are exposed to docker compose's build.args block. "
            f"Without --env-file, the build runs with no .env.docker "
            f"values and bundles get baked with empty defaults."
        )
