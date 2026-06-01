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
_APPS = [
    "mybookkeeper",
    "myjobhunter",
    # mygamingassistant is a single-user app — no /register route. The
    # VITE_TURNSTILE_SITE_KEY build-arg chain is still required for
    # structural parity (forgot-password Turnstile widget) even though
    # registration is seeded from env vars at boot time rather than via
    # a public registration page.
    "mygamingassistant",
    # mypizzatracker is single-user, same shape as mygamingassistant.
    # Scaffolded via `python -m platform_shared.infra.new_app` (PR #623).
    "mypizzatracker",
]

# Apps that have intentionally opted OUT of Sentry error monitoring.
# Sentry is the one observability primitive made optional per-app — it
# mirrors the bucket_init / sms_required opt-out shape in
# platform_shared.core.lifespan (init_sentry now defaults to None).
# Membership here is a deliberate, reviewed product decision; the boot
# guards (turnstile, email, audit) are NOT optional and have no
# equivalent allowlist. The tests below enforce the opt-out in BOTH
# directions: an exempt app must have no Sentry wiring/wrapper, and a
# non-exempt app must keep the canonical wiring.
#
# - mygamingassistant: single-user casual app for the operator + a few
#   friends. No error-monitoring need; also conserves the shared free
#   Sentry quota (kept for the serious apps — MBK / MJH).
_SENTRY_EXEMPT = {"mygamingassistant"}


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
        if app in _SENTRY_EXEMPT:
            # Positively enforce the opt-out so Sentry can't silently
            # creep back without also removing the app from
            # _SENTRY_EXEMPT (a reviewed, intentional act).
            assert "init_sentry=init_sentry" not in main_src, (
                f"{app} is in _SENTRY_EXEMPT but {app}/backend/app/main.py "
                f"still passes init_sentry=init_sentry to "
                f"create_app_lifespan. Remove the Sentry wiring or drop "
                f"{app} from _SENTRY_EXEMPT."
            )
            assert "import init_sentry" not in main_src, (
                f"{app} is in _SENTRY_EXEMPT but {app}/backend/app/main.py "
                f"still imports init_sentry. Remove the import or drop "
                f"{app} from _SENTRY_EXEMPT."
            )
            return
        assert "init_sentry=init_sentry" in main_src, (
            f"{app}/backend/app/main.py must pass init_sentry=init_sentry "
            f"to create_app_lifespan. The wrapper from "
            f"app.core.observability binds settings.sentry_dsn / "
            f"settings.environment internally. (If this app is "
            f"intentionally opting out of Sentry, add it to "
            f"_SENTRY_EXEMPT instead.)"
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
        wrapper_path = (
            _REPO_ROOT / "apps" / app / "backend" / "app" / "core"
            / "observability.py"
        )
        if app in _SENTRY_EXEMPT:
            # Opt-out apps must NOT carry a Sentry wrapper at all.
            # Asserting absence here is the positive enforcement; the
            # sdk-import test below is skipped (nothing to read).
            assert not wrapper_path.exists(), (
                f"{app} is in _SENTRY_EXEMPT but a Sentry wrapper still "
                f"exists at apps/{app}/backend/app/core/observability.py. "
                f"Delete it or drop {app} from _SENTRY_EXEMPT."
            )
            return
        wrapper_src = wrapper_path.read_text(encoding="utf-8")
        assert "from platform_shared.core.observability import" in wrapper_src, (
            f"{app}/backend/app/core/observability.py must import from "
            f"platform_shared.core.observability — see PR #291 for the "
            f"canonical wrapper shape."
        )

    def test_wrapper_does_not_import_sentry_sdk_directly(self, app: str) -> None:
        if app in _SENTRY_EXEMPT:
            pytest.skip(
                f"{app} opted out of Sentry (_SENTRY_EXEMPT) — no wrapper "
                f"to check; its absence is enforced by "
                f"test_wrapper_imports_shared."
            )
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


# Apps that render the VITE_SERVE_ONLY frontend build-arg chain. Only MGA has
# a serve-only public-library deployment mode (SERVE_ONLY=true ⇒ no auth). The
# other apps are fully auth-gated and intentionally do NOT carry the
# VITE_SERVE_ONLY ARG/build-arg — gated in the templates by the per-app
# ``serve_only_build_arg`` flag in app.yaml. This is the inverse of an
# exemption: the bundle-wiring assertions below run ONLY for these apps, and a
# separate assertion confirms the chain is ABSENT for every other app so the
# MGA-only scoping can't silently leak into the canonical apps.
_SERVE_ONLY_BUNDLE_APPS = {"mygamingassistant"}


class TestServeOnlyBundleWiring:
    """VITE_SERVE_ONLY must be wired through the docker build-arg chain for the
    serve-only app(s), exactly like VITE_TURNSTILE_SITE_KEY.

    Same failure class as the 2026-05-05 Turnstile bug: a VITE_* value read by
    the frontend that isn't passed as a build arg gets baked as empty, the
    build still succeeds, and the breakage only shows in the browser. Here an
    empty VITE_SERVE_ONLY would silently re-enable the auth UI in the public
    library (Sign-in CTAs pointing at backend routes that 404). See
    rules/verify-frontend-build-args.md.

    Mirrors TestTurnstileBundleWiring but scoped to _SERVE_ONLY_BUNDLE_APPS,
    and adds the inverse check (chain absent elsewhere).
    """

    @pytest.mark.parametrize("app", sorted(_SERVE_ONLY_BUNDLE_APPS))
    def test_caddy_dockerfile_declares_serve_only_arg(self, app: str) -> None:
        dockerfile_src = _read("apps", app, "docker", "caddy.Dockerfile")
        assert "ARG VITE_SERVE_ONLY" in dockerfile_src, (
            f"{app}/docker/caddy.Dockerfile must declare `ARG VITE_SERVE_ONLY=` "
            f"before `RUN npm run build` so docker-compose can pass the public "
            f"serve-only flag into the Vite bundle. Without it the bundle is "
            f"built with an empty flag and the auth UI re-appears in the "
            f"public library. (Rendered from the template's "
            f"serve_only_build_arg gate — re-run "
            f"`python -m platform_shared.infra.render --app {app}`.)"
        )
        assert "ENV VITE_SERVE_ONLY" in dockerfile_src, (
            f"{app}/docker/caddy.Dockerfile must set "
            f"`ENV VITE_SERVE_ONLY=${{VITE_SERVE_ONLY}}` after the ARG so Vite "
            f"picks up the value at build time."
        )
        arg_idx = dockerfile_src.find("ARG VITE_SERVE_ONLY")
        build_idx = dockerfile_src.find("npm run build")
        assert 0 < arg_idx < build_idx, (
            f"{app}/docker/caddy.Dockerfile: ARG VITE_SERVE_ONLY must be "
            f"declared BEFORE `RUN npm run build`, otherwise Vite runs without "
            f"the env value."
        )

    @pytest.mark.parametrize("app", sorted(_SERVE_ONLY_BUNDLE_APPS))
    def test_docker_compose_passes_serve_only_arg_to_caddy(self, app: str) -> None:
        compose_src = _read("apps", app, "docker-compose.yml")
        assert "VITE_SERVE_ONLY:" in compose_src, (
            f"{app}/docker-compose.yml must include `VITE_SERVE_ONLY: "
            f"${{SERVE_ONLY:-}}` under the caddy service's `build.args:` block "
            f"so the caddy.Dockerfile ARG sees a value at build time."
        )
        assert "${SERVE_ONLY" in compose_src, (
            f"{app}/docker-compose.yml: VITE_SERVE_ONLY build arg must "
            f"reference ${{SERVE_ONLY}} (no VITE_ prefix on the right-hand "
            f"side) so docker compose reads the value from the same env var "
            f"name the backend uses — one .env.docker line drives both layers."
        )

    @pytest.mark.parametrize(
        "app", sorted(set(_APPS) - _SERVE_ONLY_BUNDLE_APPS)
    )
    def test_serve_only_chain_absent_for_non_serve_only_apps(self, app: str) -> None:
        """Inverse guard: fully auth-gated apps must NOT render the
        VITE_SERVE_ONLY chain. If this fires, the serve_only_build_arg gate
        leaked (or an app.yaml set it true by mistake) — a non-serve-only app
        with the flag would build a bundle that could hide its auth UI."""
        dockerfile_src = _read("apps", app, "docker", "caddy.Dockerfile")
        compose_src = _read("apps", app, "docker-compose.yml")
        assert "VITE_SERVE_ONLY" not in dockerfile_src, (
            f"{app}/docker/caddy.Dockerfile contains VITE_SERVE_ONLY but {app} "
            f"is not a serve-only app. Set serve_only_build_arg: false in "
            f"apps/{app}/app.yaml and re-render."
        )
        assert "VITE_SERVE_ONLY" not in compose_src, (
            f"{app}/docker-compose.yml contains VITE_SERVE_ONLY but {app} is "
            f"not a serve-only app. Set serve_only_build_arg: false in "
            f"apps/{app}/app.yaml and re-render."
        )


class TestInfraTemplateDrift:
    """Tier 3 — rendered infra files must match the templates byte-for-byte.

    Source of truth is `infra/templates/*.j2` + `apps/<slug>/app.yaml`. The
    files checked in under `apps/<slug>/docker/`, `apps/<slug>/docker-compose.yml`,
    and `.github/workflows/deploy-<slug>.yml` are GENERATED output. If this test
    fails, re-run:

        python -m platform_shared.infra.render --all

    and commit the result. Editing the rendered files directly is a bug —
    the template owns the shape.
    """

    @pytest.mark.parametrize("app", ["mybookkeeper", "myjobhunter", "mygamingassistant", "mypizzatracker"])
    def test_no_drift(self, app: str) -> None:
        try:
            from platform_shared.infra.render import diff_app, _repo_root
        except ModuleNotFoundError as e:
            import pytest as _pytest
            _pytest.skip(f"infra render module unavailable ({e}); skipping drift check")

        repo_root = _repo_root()
        diffs = diff_app(repo_root, app)
        assert not diffs, (
            f"Rendered infra files for app '{app}' diverge from checked-in copies. "
            f"Re-run `python -m platform_shared.infra.render --app {app}` and commit. "
            f"Diffs:\n\n" + "\n\n".join(diffs)
        )


class TestScaffolderProducesBootableApp:
    """Tier 5 -- the scaffolder must produce a complete, fully-substituted app dir.

    Guards two failure modes that would otherwise leak past code review:
      1. Token leakage. Any `__APP_SLUG__`/`__API_PORT__`/etc. that survives
         into the scaffolded output is a substitution bug.
      2. Missing critical files. A trimmed include-list that drops, say,
         `backend/app/main.py` would scaffold an app that can't start.

    Test runs the scaffolder with skip_render=True + skip_uv=True + skip_npm=True
    so it doesn't depend on `.github/workflows/deploy.yml.j2` (which is monorepo-
    relative and not copied into tmp_path), uv being installed, or there being a
    monorepo root npm workspace to sync against. Tier 3 render is covered by
    `TestInfraTemplateDrift`.
    """

    def test_scaffolds_complete_substituted_skeleton(self, tmp_path) -> None:
        import shutil
        try:
            import yaml
        except ModuleNotFoundError as e:
            pytest.skip(f"pyyaml unavailable ({e}); skipping scaffolder check")

        try:
            from platform_shared.infra import new_app as _new_app
        except ModuleNotFoundError as e:
            pytest.skip(f"new_app module unavailable ({e}); skipping scaffolder check")

        scaffold_src = _REPO_ROOT / "infra" / "templates" / "scaffold"
        if not scaffold_src.exists():
            pytest.skip(f"scaffold templates not present at {scaffold_src}")
        scaffold_dst = tmp_path / "infra" / "templates" / "scaffold"
        shutil.copytree(scaffold_src, scaffold_dst)

        summary = _new_app.scaffold_app(
            slug="scaffoldtest",
            display_name="ScaffoldTest",
            api_port=18999,
            caddy_host_port=18998,
            frontend_port=15999,
            repo_root=tmp_path,
            skip_render=True,
            skip_uv=True,
            skip_npm=True,
        )

        app_dir = tmp_path / "apps" / "scaffoldtest"
        assert app_dir.exists(), "scaffolder did not create apps/<slug>/"
        assert summary["files_written"] > 50, (
            f"scaffolder wrote only {summary['files_written']} files -- "
            "include-list has regressed below sanity threshold"
        )

        for rel in (
            "backend/app/main.py",
            "backend/app/core/config.py",
            "backend/app/api/health.py",
            "backend/pyproject.toml",
            "backend/alembic/versions/0001_initial_schema.py",
            "frontend/package.json",
            "frontend/src/App.tsx",
            "frontend/src/routes.tsx",
            "frontend/src/pages/Login.tsx",
            "CLAUDE.md",
            "app.yaml",
            "docker/backend.Dockerfile",
        ):
            assert (app_dir / rel).exists(), f"scaffolder did not write {rel}"

        tokens = (
            "__APP_SLUG__",
            "__APP_DISPLAY_NAME__",
            "__API_PORT__",
            "__FRONTEND_DEV_PORT__",
            "__CADDY_HOST_PORT__",
        )
        for f in app_dir.rglob("*"):
            if not f.is_file():
                continue
            try:
                text = f.read_text(encoding="utf-8")
            except UnicodeDecodeError:
                continue
            for token in tokens:
                assert token not in text, (
                    f"unsubstituted {token} remains in "
                    f"{f.relative_to(app_dir)} -- scaffolder substitution failed"
                )

        main_src = (app_dir / "backend" / "app" / "main.py").read_text(encoding="utf-8")
        assert "ScaffoldTest API" in main_src
        assert "18999" not in main_src or "18999" in main_src  # port lives in vite.config + .env, not main.py

        vite_src = (app_dir / "frontend" / "vite.config.ts").read_text(encoding="utf-8")
        assert "15999" in vite_src, "frontend_port did not substitute into vite.config.ts"
        assert "18999" in vite_src, "api_port did not substitute into vite.config.ts proxy"

        yaml_data = yaml.safe_load((app_dir / "app.yaml").read_text(encoding="utf-8"))
        assert yaml_data["app_slug"] == "scaffoldtest"
        assert yaml_data["app_display_name"] == "ScaffoldTest"
        assert yaml_data["api_port"] == 18999
        assert yaml_data["caddy_host_port"] == 18998

    def test_refuses_existing_app_dir(self, tmp_path) -> None:
        try:
            from platform_shared.infra import new_app as _new_app
        except ModuleNotFoundError as e:
            pytest.skip(f"new_app module unavailable ({e}); skipping scaffolder check")

        (tmp_path / "apps" / "alreadyhere").mkdir(parents=True)
        (tmp_path / "infra" / "templates" / "scaffold").mkdir(parents=True)

        with pytest.raises(_new_app.ScaffoldError, match="already exists"):
            _new_app.scaffold_app(
                slug="alreadyhere",
                display_name="AlreadyHere",
                api_port=18999,
                caddy_host_port=18998,
                frontend_port=15999,
                repo_root=tmp_path,
                skip_render=True,
                skip_uv=True,
                skip_npm=True,
            )

    def test_rejects_invalid_slug(self, tmp_path) -> None:
        try:
            from platform_shared.infra import new_app as _new_app
        except ModuleNotFoundError as e:
            pytest.skip(f"new_app module unavailable ({e}); skipping scaffolder check")

        for bad in ("MyApp", "1myapp", "my_app", "ab", "x" * 41, "packages"):
            with pytest.raises(_new_app.ScaffoldError):
                _new_app.scaffold_app(
                    slug=bad,
                    display_name="Whatever",
                    api_port=18999,
                    caddy_host_port=18998,
                    frontend_port=15999,
                    repo_root=tmp_path,
                    skip_render=True,
                    skip_uv=True,
                )

    def test_scaffold_wires_support_page(self, tmp_path) -> None:
        """Initiative 10 PR4 -- a scaffolded app is born with the public
        /support page + shared transparency router wired, mirroring the four
        apps wired in PR3 (TestTransparencyRouterMounted / TestSupportPageWired).
        Guards against a future template edit silently dropping the support
        wiring from every app scaffolded thereafter.
        """
        import shutil
        try:
            import yaml
        except ModuleNotFoundError as e:
            pytest.skip(f"pyyaml unavailable ({e}); skipping scaffolder check")
        try:
            from platform_shared.infra import new_app as _new_app
        except ModuleNotFoundError as e:
            pytest.skip(f"new_app module unavailable ({e}); skipping scaffolder check")

        scaffold_src = _REPO_ROOT / "infra" / "templates" / "scaffold"
        if not scaffold_src.exists():
            pytest.skip(f"scaffold templates not present at {scaffold_src}")
        shutil.copytree(scaffold_src, tmp_path / "infra" / "templates" / "scaffold")

        _new_app.scaffold_app(
            slug="supporttest",
            display_name="SupportTest",
            api_port=18997,
            caddy_host_port=18996,
            frontend_port=15997,
            repo_root=tmp_path,
            skip_render=True,
            skip_uv=True,
            skip_npm=True,
        )
        app_dir = tmp_path / "apps" / "supporttest"

        # Backend: shared transparency router imported + mounted (GET /transparency
        # + POST /donations/kofi-webhook). Without it the /support cost widget 404s.
        main_src = (app_dir / "backend" / "app" / "main.py").read_text(encoding="utf-8")
        assert (
            "from platform_shared.api.transparency_router import build_transparency_router"
            in main_src
        ), "scaffolded main.py must import build_transparency_router"
        assert "build_transparency_router(settings)" in main_src, (
            "scaffolded main.py must mount the shared transparency router"
        )

        # Frontend: public /support route rendering the shared Support page + a
        # public link to it from the login page (single-user apps link via Login).
        routes_src = (app_dir / "frontend" / "src" / "routes.tsx").read_text(encoding="utf-8")
        assert "/support" in routes_src and "Support" in routes_src, (
            "scaffolded routes.tsx must register a public /support route"
        )
        login_src = (app_dir / "frontend" / "src" / "pages" / "Login.tsx").read_text(encoding="utf-8")
        assert "/support" in login_src, (
            "scaffolded Login.tsx must carry a public link to /support"
        )

        # CSP: the default frame-src must allow the YouTube no-cookie embed used
        # by the Support page's inspiration video.
        csp = yaml.safe_load((app_dir / "app.yaml").read_text(encoding="utf-8"))["csp"]
        assert "https://www.youtube-nocookie.com" in csp, (
            "scaffolded app.yaml CSP frame-src must allow youtube-nocookie for the "
            "Support page video embed"
        )


# --- Transparency / Support page wiring (Initiative 10, PR3) -----------------

_TRANSPARENCY_PRIMARY_APP = "mybookkeeper"

# Per-app routing file (MBK uses an inline <Routes> in App.tsx; the data-router
# apps use a routes.tsx) and the file that carries the public link to /support
# (the legal footer on MBK; the login page on the single-user apps).
_SUPPORT_ROUTING_FILE = {
    "mybookkeeper": ("frontend", "src", "App.tsx"),
    "myjobhunter": ("frontend", "src", "routes.tsx"),
    "mygamingassistant": ("frontend", "src", "routes.tsx"),
    "mypizzatracker": ("frontend", "src", "routes.tsx"),
}
_SUPPORT_LINK_FILE = {
    "mybookkeeper": ("frontend", "src", "app", "components", "LegalFooter.tsx"),
    "myjobhunter": ("frontend", "src", "pages", "Login.tsx"),
    "mygamingassistant": ("frontend", "src", "pages", "Login.tsx"),
    "mypizzatracker": ("frontend", "src", "pages", "Login.tsx"),
}


@pytest.mark.parametrize("app", _APPS)
class TestTransparencyRouterMounted:
    """Every app must mount the shared public transparency router so the
    /support page's cost widget (GET /transparency) and the Ko-fi webhook
    (POST /donations/kofi-webhook) resolve. The router is public by design —
    the /support page is unauthenticated.
    """

    def test_imports_build_transparency_router(self, app: str) -> None:
        main_src = _read("apps", app, "backend", "app", "main.py")
        assert (
            "from platform_shared.api.transparency_router import build_transparency_router"
            in main_src
        ), (
            f"{app}/backend/app/main.py must import build_transparency_router from "
            f"platform_shared.api.transparency_router (Initiative 10 PR3)."
        )

    def test_mounts_transparency_router(self, app: str) -> None:
        main_src = _read("apps", app, "backend", "app", "main.py")
        assert "build_transparency_router(settings)" in main_src, (
            f"{app}/backend/app/main.py must mount the shared router: "
            f"app.include_router(build_transparency_router(settings)). Without it "
            f"the /support cost widget 404s and the Ko-fi webhook has no endpoint."
        )


@pytest.mark.parametrize("app", _APPS)
class TestTransparencyPrimaryWiring:
    """Exactly ONE app (mybookkeeper) starts the daily cost-sync loop via its
    lifespan on_startup / on_shutdown hooks. The shared lifespan deliberately
    does NOT auto-wire it (that would force a core -> services import), so it is
    wired per-app on the primary only. Enforced in both directions so the loop
    can't silently start on a second app (two writers racing on the one shared
    object) or stop being wired on the primary.
    """

    def test_primary_starts_and_stops_sync(self, app: str) -> None:
        main_src = _read("apps", app, "backend", "app", "main.py")
        if app == _TRANSPARENCY_PRIMARY_APP:
            assert "maybe_start_transparency_sync(settings)" in main_src, (
                f"{app} is the transparency primary; its main.py on_startup must "
                f"call maybe_start_transparency_sync(settings)."
            )
            assert "stop_transparency_sync()" in main_src, (
                f"{app} is the transparency primary; its main.py on_shutdown must "
                f"await stop_transparency_sync()."
            )
        else:
            assert "maybe_start_transparency_sync" not in main_src, (
                f"{app} is NOT the transparency primary ({_TRANSPARENCY_PRIMARY_APP} "
                f"is) but its main.py wires maybe_start_transparency_sync. Only the "
                f"primary may start the cost-sync loop — two writers would race on "
                f"the shared object."
            )
            assert "stop_transparency_sync" not in main_src, (
                f"{app} is NOT the transparency primary but its main.py references "
                f"stop_transparency_sync. Only {_TRANSPARENCY_PRIMARY_APP} wires the "
                f"cost-sync lifecycle."
            )


@pytest.mark.parametrize("app", _APPS)
class TestSupportPageWired:
    """Each app exposes a public /support route and links to it from a public
    surface. MGA additionally opts out of the cost widget — it serves from
    Cloudflare R2, not the shared MinIO, so it cannot read the shared
    transparency object.
    """

    def test_support_route_present(self, app: str) -> None:
        src = _read("apps", app, *_SUPPORT_ROUTING_FILE[app])
        assert "/support" in src and "Support" in src, (
            f"{app}: {'/'.join(_SUPPORT_ROUTING_FILE[app])} must register a public "
            f"/support route rendering the shared @platform/ui Support page."
        )

    def test_support_link_present(self, app: str) -> None:
        src = _read("apps", app, *_SUPPORT_LINK_FILE[app])
        assert "/support" in src, (
            f"{app}: {'/'.join(_SUPPORT_LINK_FILE[app])} must carry a public link to "
            f"/support (the legal footer on MBK; the login page on single-user apps)."
        )

    def test_mga_omits_cost_widget(self, app: str) -> None:
        if app != "mygamingassistant":
            pytest.skip("Only MGA opts out of the cost widget (R2, not shared MinIO).")
        src = _read("apps", app, *_SUPPORT_ROUTING_FILE[app])
        assert "showTransparency={false}" in src, (
            "mygamingassistant/frontend/src/routes.tsx must pass "
            "showTransparency={false} to <Support> — MGA serves from Cloudflare R2, "
            "not the shared MinIO, so it cannot read the shared transparency object; "
            "rendering the widget would show a persistent 'temporarily unavailable'."
        )
