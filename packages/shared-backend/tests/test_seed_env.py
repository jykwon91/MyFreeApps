"""Tests for platform_shared.infra.seed_env — the first-boot env seeder."""

from __future__ import annotations

import base64
import os
import re
import stat
import sys
from pathlib import Path

import pytest

from platform_shared.infra import seed_env

COMPOSE_EXAMPLE = """\
# Compose-level env file — only contains DB_PASSWORD.
# The full app config lives in backend/.env.docker.

DB_PASSWORD=change-me-random-password
"""

DOCKER_EXAMPLE = """\
# Docker environment template — consumed by docker-compose.yml `env_file:`.

# Deployment environment
ENVIRONMENT=production

# Sentry DSN — required when ENVIRONMENT=production.
SENTRY_DSN=

SECRET_KEY=change-me-to-random-64-chars
ENCRYPTION_KEY=change-me-to-random-64-chars

# Frontend / CORS
FRONTEND_URL=https://testapp.myfreeapps.org
CORS_ORIGINS=["https://testapp.myfreeapps.org"]

JWT_LIFETIME_SECONDS=1800
LOCKOUT_THRESHOLD=5

TURNSTILE_SECRET_KEY=
TURNSTILE_SITE_KEY=

EMAIL_BACKEND=smtp
EMAIL_FROM_ADDRESS=
SMTP_HOST=smtp.gmail.com
SMTP_USER=
SMTP_PASSWORD=

# Optional feature key
ANTHROPIC_API_KEY=
"""


@pytest.fixture()
def repo(tmp_path: Path) -> Path:
    app = tmp_path / "apps" / "testapp"
    (app / "backend").mkdir(parents=True)
    (app / ".env.example").write_text(COMPOSE_EXAMPLE, encoding="utf-8")
    (app / "backend" / ".env.docker.example").write_text(DOCKER_EXAMPLE, encoding="utf-8")
    return tmp_path


def run(repo: Path, *extra: str) -> int:
    return seed_env._cli(["--app", "testapp", "--repo-root", str(repo), *extra])


def read_env(path: Path) -> dict[str, str]:
    return seed_env._parse_env(path.read_text(encoding="utf-8"))


class TestFreshSeed:
    def test_creates_both_files_and_reports_blanks(self, repo: Path, capsys):
        rc = run(repo)
        assert rc == 1  # operator-external values still blank

        compose = repo / "apps" / "testapp" / ".env"
        docker = repo / "apps" / "testapp" / "backend" / ".env.docker"
        assert compose.exists() and docker.exists()

        out = capsys.readouterr().out
        assert "REQUIRED" in out
        for key in ("SENTRY_DSN", "SMTP_USER", "SMTP_PASSWORD",
                    "EMAIL_FROM_ADDRESS", "TURNSTILE_SITE_KEY", "TURNSTILE_SECRET_KEY"):
            assert key in out
        # SEED_USER_* / SEED_ADMIN_* not declared by this app — must not be demanded
        assert "SEED_USER_EMAIL" not in out
        assert "SEED_ADMIN_EMAIL" not in out
        # optional key listed informationally, not as required
        assert "ANTHROPIC_API_KEY" in out

    def test_seed_admin_keys_enforced_when_declared(self, repo: Path, capsys):
        """A multi-user app declaring SEED_ADMIN_* must have them flagged as
        required blanks (and --check must fail) until the operator fills them."""
        docker_example = repo / "apps" / "testapp" / "backend" / ".env.docker.example"
        docker_example.write_text(
            docker_example.read_text(encoding="utf-8")
            + "\nSEED_ADMIN_EMAIL=\nSEED_ADMIN_PASSWORD_HASH=\n",
            encoding="utf-8",
        )

        rc = run(repo)
        assert rc == 1
        out = capsys.readouterr().out
        assert "SEED_ADMIN_EMAIL" in out
        assert "SEED_ADMIN_PASSWORD_HASH" in out

        rc = run(repo, "--check")
        assert rc == 1

    def test_generated_secret_shapes(self, repo: Path):
        run(repo)
        compose = read_env(repo / "apps" / "testapp" / ".env")
        docker = read_env(repo / "apps" / "testapp" / "backend" / ".env.docker")

        assert re.fullmatch(r"[0-9a-f]{48}", compose["DB_PASSWORD"])
        assert re.fullmatch(r"[0-9a-f]{64}", docker["SECRET_KEY"])
        # Fernet format: urlsafe b64 of exactly 32 bytes
        raw = base64.urlsafe_b64decode(docker["ENCRYPTION_KEY"].encode())
        assert len(raw) == 32

    def test_defaults_and_stamps_preserved(self, repo: Path):
        run(repo)
        docker = read_env(repo / "apps" / "testapp" / "backend" / ".env.docker")
        assert docker["ENVIRONMENT"] == "production"
        assert docker["FRONTEND_URL"] == "https://testapp.myfreeapps.org"
        assert docker["CORS_ORIGINS"] == '["https://testapp.myfreeapps.org"]'
        assert docker["LOCKOUT_THRESHOLD"] == "5"
        assert docker["EMAIL_BACKEND"] == "smtp"

    def test_comments_survive(self, repo: Path):
        run(repo)
        text = (repo / "apps" / "testapp" / "backend" / ".env.docker").read_text(encoding="utf-8")
        assert "# Sentry DSN — required when ENVIRONMENT=production." in text

    @pytest.mark.skipif(sys.platform == "win32", reason="POSIX file modes")
    def test_chmod_600(self, repo: Path):
        run(repo)
        for rel in (".env", "backend/.env.docker"):
            mode = stat.S_IMODE(os.stat(repo / "apps" / "testapp" / rel).st_mode)
            assert mode == 0o600

    def test_domain_override_stamps_blank_urls(self, repo: Path):
        example = repo / "apps" / "testapp" / "backend" / ".env.docker.example"
        example.write_text(
            example.read_text(encoding="utf-8")
            .replace("FRONTEND_URL=https://testapp.myfreeapps.org", "FRONTEND_URL=")
            .replace('CORS_ORIGINS=["https://testapp.myfreeapps.org"]', "CORS_ORIGINS="),
            encoding="utf-8",
        )
        run(repo, "--domain", "custom.example.org")
        docker = read_env(repo / "apps" / "testapp" / "backend" / ".env.docker")
        assert docker["FRONTEND_URL"] == "https://custom.example.org"
        assert docker["CORS_ORIGINS"] == '["https://custom.example.org"]'


class TestIdempotence:
    def test_second_run_changes_nothing(self, repo: Path):
        run(repo)
        docker_path = repo / "apps" / "testapp" / "backend" / ".env.docker"
        compose_path = repo / "apps" / "testapp" / ".env"
        first_docker = docker_path.read_text(encoding="utf-8")
        first_compose = compose_path.read_text(encoding="utf-8")

        rc = run(repo)
        assert rc == 1
        assert docker_path.read_text(encoding="utf-8") == first_docker
        assert compose_path.read_text(encoding="utf-8") == first_compose

    def test_operator_values_never_overwritten(self, repo: Path):
        run(repo)
        docker_path = repo / "apps" / "testapp" / "backend" / ".env.docker"
        filled = docker_path.read_text(encoding="utf-8")
        for key, value in (
            ("SENTRY_DSN", "https://abc@sentry.example/1"),
            ("SMTP_USER", "ops@example.org"),
            ("SMTP_PASSWORD", "app-password"),
            ("EMAIL_FROM_ADDRESS", "noreply@example.org"),
            ("TURNSTILE_SITE_KEY", "0x4AAAsite"),
            ("TURNSTILE_SECRET_KEY", "0x4AAAsecret"),
        ):
            filled = filled.replace(f"{key}=", f"{key}={value}", 1)
        docker_path.write_text(filled, encoding="utf-8")

        rc = run(repo)
        assert rc == 0  # all required values present now
        docker = read_env(docker_path)
        assert docker["SENTRY_DSN"] == "https://abc@sentry.example/1"
        assert docker["TURNSTILE_SITE_KEY"] == "0x4AAAsite"

    def test_placeholder_values_are_regenerated(self, repo: Path):
        docker_path = repo / "apps" / "testapp" / "backend" / ".env.docker"
        docker_path.parent.mkdir(parents=True, exist_ok=True)
        docker_path.write_text("SECRET_KEY=change-me-to-random-64-chars\n", encoding="utf-8")
        run(repo)
        docker = read_env(docker_path)
        assert re.fullmatch(r"[0-9a-f]{64}", docker["SECRET_KEY"])

    def test_unknown_existing_keys_preserved(self, repo: Path):
        docker_path = repo / "apps" / "testapp" / "backend" / ".env.docker"
        docker_path.parent.mkdir(parents=True, exist_ok=True)
        docker_path.write_text("CUSTOM_OPERATOR_KEY=keep-me\n", encoding="utf-8")
        run(repo)
        docker = read_env(docker_path)
        assert docker["CUSTOM_OPERATOR_KEY"] == "keep-me"


class TestOverrides:
    def _overrides(self, tmp_path: Path, content: str) -> Path:
        path = tmp_path / "overrides.env"
        path.write_text(content, encoding="utf-8")
        return path

    def test_fills_required_blanks_to_green(self, repo: Path, tmp_path: Path):
        ov = self._overrides(tmp_path, """\
SENTRY_DSN=https://ov@sentry.example/2
SMTP_USER=ops@example.org
SMTP_PASSWORD=app-password
EMAIL_FROM_ADDRESS=noreply@example.org
TURNSTILE_SITE_KEY=0x4AAAsite
TURNSTILE_SECRET_KEY=0x4AAAsecret
""")
        rc = run(repo, "--overrides", str(ov))
        assert rc == 0  # all required values provided in one shot
        docker = read_env(repo / "apps" / "testapp" / "backend" / ".env.docker")
        assert docker["SENTRY_DSN"] == "https://ov@sentry.example/2"
        assert run(repo, "--check") == 0

    def test_override_wins_over_existing_value(self, repo: Path, tmp_path: Path):
        run(repo)
        ov = self._overrides(tmp_path, "SMTP_HOST=smtp.rotated.example\n")
        run(repo, "--overrides", str(ov))
        docker = read_env(repo / "apps" / "testapp" / "backend" / ".env.docker")
        assert docker["SMTP_HOST"] == "smtp.rotated.example"  # was smtp.gmail.com

    def test_blank_override_never_erases(self, repo: Path, tmp_path: Path):
        run(repo)
        docker_path = repo / "apps" / "testapp" / "backend" / ".env.docker"
        docker_path.write_text(
            docker_path.read_text(encoding="utf-8").replace(
                "SENTRY_DSN=", "SENTRY_DSN=https://keep@sentry.example/1", 1),
            encoding="utf-8")
        ov = self._overrides(tmp_path, "SENTRY_DSN=\n")
        run(repo, "--overrides", str(ov))
        assert read_env(docker_path)["SENTRY_DSN"] == "https://keep@sentry.example/1"

    def test_undeclared_override_warns_and_is_ignored(self, repo: Path, tmp_path: Path, capsys):
        ov = self._overrides(tmp_path, "NO_SUCH_KEY=value\n")
        run(repo, "--overrides", str(ov))
        out = capsys.readouterr().out
        assert "not declared" in out and "NO_SUCH_KEY" in out
        docker_text = (repo / "apps" / "testapp" / "backend" / ".env.docker").read_text(encoding="utf-8")
        assert "NO_SUCH_KEY" not in docker_text

    def test_special_characters_survive(self, repo: Path, tmp_path: Path):
        # Gmail app passwords contain spaces; bcrypt hashes contain `$`.
        ov = self._overrides(tmp_path, "SMTP_PASSWORD=abcd efgh $2b$12 'quo\"te\n")
        run(repo, "--overrides", str(ov))
        docker = read_env(repo / "apps" / "testapp" / "backend" / ".env.docker")
        assert docker["SMTP_PASSWORD"] == "abcd efgh $2b$12 'quo\"te"

    def test_missing_overrides_file_exits_2(self, repo: Path, capsys):
        rc = run(repo, "--overrides", str(repo / "nope.env"))
        assert rc == 2
        assert "Overrides file not found" in capsys.readouterr().err


class TestCheckMode:
    def test_check_fails_on_missing_files(self, repo: Path, capsys):
        rc = run(repo, "--check")
        assert rc == 1
        assert "MISSING file" in capsys.readouterr().out
        # check mode must not create anything
        assert not (repo / "apps" / "testapp" / ".env").exists()

    def test_check_fails_on_blank_required(self, repo: Path, capsys):
        run(repo)  # seed with blanks
        rc = run(repo, "--check")
        assert rc == 1
        out = capsys.readouterr().out
        assert "BLANK SENTRY_DSN" in out

    def test_check_passes_when_filled(self, repo: Path):
        run(repo)
        docker_path = repo / "apps" / "testapp" / "backend" / ".env.docker"
        filled = docker_path.read_text(encoding="utf-8")
        for key in ("SENTRY_DSN", "SMTP_USER", "SMTP_PASSWORD", "EMAIL_FROM_ADDRESS",
                    "TURNSTILE_SITE_KEY", "TURNSTILE_SECRET_KEY"):
            filled = filled.replace(f"{key}=", f"{key}=some-value", 1)
        docker_path.write_text(filled, encoding="utf-8")
        assert run(repo, "--check") == 0


class TestErrors:
    def test_unknown_app_exits_2(self, repo: Path, capsys):
        rc = seed_env._cli(["--app", "nosuchapp", "--repo-root", str(repo)])
        assert rc == 2
        assert "No app at" in capsys.readouterr().err

    def test_missing_template_exits_2(self, repo: Path, capsys):
        (repo / "apps" / "testapp" / "backend" / ".env.docker.example").unlink()
        rc = run(repo)
        assert rc == 2
        assert "Missing template" in capsys.readouterr().err


class TestRealAppTemplates:
    """The seeder must work against every real app's checked-in templates."""

    def _real_repo_root(self) -> Path:
        return Path(__file__).resolve().parents[3]

    @pytest.mark.parametrize("slug", [
        p.parent.name
        for p in sorted(Path(__file__).resolve().parents[3].glob("apps/*/app.yaml"))
    ])
    def test_seed_real_app_into_tmp(self, slug: str, tmp_path: Path):
        """Copy each real app's templates into a tmp repo and seed it."""
        real = self._real_repo_root() / "apps" / slug
        app = tmp_path / "apps" / slug
        (app / "backend").mkdir(parents=True)
        (app / ".env.example").write_text(
            (real / ".env.example").read_text(encoding="utf-8"), encoding="utf-8")
        (app / "backend" / ".env.docker.example").write_text(
            (real / "backend" / ".env.docker.example").read_text(encoding="utf-8"),
            encoding="utf-8")

        rc = seed_env._cli(["--app", slug, "--repo-root", str(tmp_path)])
        assert rc in (0, 1)  # 1 = operator blanks remain (expected); never 2/crash

        docker = read_env(app / "backend" / ".env.docker")
        compose = read_env(app / ".env")
        assert re.fullmatch(r"[0-9a-f]{48}", compose["DB_PASSWORD"])
        assert re.fullmatch(r"[0-9a-f]{64}", docker["SECRET_KEY"])
        assert not docker["ENCRYPTION_KEY"].startswith("change-me")
