"""First-boot env seeder — create both required env files for an app in one shot.

Creates ``apps/<slug>/.env`` (compose-level, DB_PASSWORD) and
``apps/<slug>/backend/.env.docker`` (app-level) from their checked-in
``.env.example`` / ``.env.docker.example`` templates:

* AUTO-GENERATES secrets: ``DB_PASSWORD`` (hex 48), ``SECRET_KEY`` (hex 64),
  ``ENCRYPTION_KEY`` (Fernet-format, urlsafe base64 of 32 random bytes).
* STAMPS deploy values when the template left them blank:
  ``ENVIRONMENT=production``, ``FRONTEND_URL`` / ``CORS_ORIGINS`` from the
  app domain (``<slug>.myfreeapps.org`` by convention, ``--domain`` to override).
* LEAVES operator-external values blank and exits non-zero with a checklist:
  SENTRY_DSN, SMTP_USER/SMTP_PASSWORD/EMAIL_FROM_ADDRESS, TURNSTILE_*,
  SEED_USER_* (whichever of those the app's template actually declares).

Idempotent: an existing non-empty, non-placeholder value is NEVER overwritten,
so re-running after the operator fills the blanks is a no-op. Keys present in
an existing file but absent from the template are preserved. Both files are
chmod 600.

Runs on the VPS host python3 with NO third-party deps (stdlib only — do not
import yaml/jinja2 here; unlike render.py this module must work outside a dev
venv). From the VPS checkout:

    cd /srv/myfreeapps
    PYTHONPATH=packages/shared-backend python3 -m platform_shared.infra.seed_env --app myrecipes

Deploy-preflight / verification mode (writes nothing, exit 0 = ready):

    PYTHONPATH=packages/shared-backend python3 -m platform_shared.infra.seed_env --app myrecipes --check

No-SSH path: the "Seed VPS env files" workflow (.github/workflows/seed-env.yml)
runs this module on the VPS over SSH, injecting per-app GitHub repo secrets
(``<APPUPPER>_SENTRY_DSN`` etc.) via ``--overrides``. Overrides win over
existing values — re-dispatch after rotating a secret to update the VPS file.
"""

from __future__ import annotations

import argparse
import base64
import os
import secrets
import sys
from pathlib import Path

# Values the operator must obtain outside the VPS (dashboards, providers).
# Only the subset actually declared in the app's template is enforced.
REQUIRED_OPERATOR_KEYS: tuple[str, ...] = (
    "SENTRY_DSN",
    "EMAIL_FROM_ADDRESS",
    "SMTP_USER",
    "SMTP_PASSWORD",
    "TURNSTILE_SITE_KEY",
    "TURNSTILE_SECRET_KEY",
    "SEED_USER_EMAIL",
    "SEED_USER_PASSWORD_HASH",
)

# Short operator-facing hints for the checklist output.
_KEY_HINTS: dict[str, str] = {
    "SENTRY_DSN": "Sentry -> Settings -> Projects -> <app>-api -> Client Keys (DSN)",
    "EMAIL_FROM_ADDRESS": "sender address for verification/reset emails",
    "SMTP_USER": "SMTP login (e.g. Gmail address)",
    "SMTP_PASSWORD": "SMTP password (e.g. Gmail app password)",
    "TURNSTILE_SITE_KEY": "Cloudflare Turnstile widget site key (public)",
    "TURNSTILE_SECRET_KEY": "Cloudflare Turnstile secret key",
    "SEED_USER_EMAIL": "single-user operator account email",
    "SEED_USER_PASSWORD_HASH": "bcrypt hash of the operator password",
}

# Placeholder prefixes in the example templates that count as "not set".
_PLACEHOLDER_PREFIXES: tuple[str, ...] = ("change-me", "__APP_SLUG__")


class SeedEnvError(RuntimeError):
    """Raised for user-recoverable failures (bad slug, missing templates)."""


def _repo_root() -> Path:
    """Return the monorepo root (the dir containing `infra/`, `apps/`, `.github/`)."""
    # platform_shared/infra/seed_env.py -> up 4 = monorepo root
    return Path(__file__).resolve().parents[4]


def _is_unset(value: str) -> bool:
    v = value.strip()
    if not v:
        return True
    return any(v.startswith(p) or p in v for p in _PLACEHOLDER_PREFIXES)


def _gen_db_password() -> str:
    return secrets.token_hex(24)


def _gen_secret_key() -> str:
    return secrets.token_hex(32)


def _gen_encryption_key() -> str:
    # Fernet key format: urlsafe base64 of 32 random bytes. The shared PII
    # suite HKDF-derives from this string, so the format doubles as valid
    # direct Fernet key material.
    return base64.urlsafe_b64encode(secrets.token_bytes(32)).decode()


_GENERATORS = {
    "DB_PASSWORD": _gen_db_password,
    "SECRET_KEY": _gen_secret_key,
    "ENCRYPTION_KEY": _gen_encryption_key,
}


def _parse_env(text: str) -> dict[str, str]:
    """Parse KEY=VALUE lines into a dict. Comments/blank lines are skipped."""
    values: dict[str, str] = {}
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, _, value = stripped.partition("=")
        values[key.strip()] = value.strip()
    return values


def _read_env_file(path: Path) -> dict[str, str]:
    if not path.exists():
        return {}
    return _parse_env(path.read_text(encoding="utf-8"))


def _stamps(domain: str) -> dict[str, str]:
    return {
        "ENVIRONMENT": "production",
        "FRONTEND_URL": f"https://{domain}",
        "CORS_ORIGINS": f'["https://{domain}"]',
    }


def _resolve_value(key: str, example_value: str, existing: dict[str, str],
                   stamps: dict[str, str], overrides: dict[str, str]) -> str:
    """Pick the final value for one key. Precedence:

    1. explicit override (``--overrides`` file — deliberate set/rotate,
       so it wins even over an existing value)
    2. existing real value (idempotence — never clobber operator input)
    3. example real value (checked-in defaults like LOCKOUT_THRESHOLD=5)
    4. generated secret
    5. deploy stamp
    6. blank
    """
    if key in overrides:
        return overrides[key]
    existing_value = existing.get(key, "")
    if not _is_unset(existing_value):
        return existing_value
    if not _is_unset(example_value):
        return example_value
    if key in _GENERATORS:
        return _GENERATORS[key]()
    if key in stamps:
        return stamps[key]
    return ""


def _load_overrides(path: Path) -> dict[str, str]:
    """Parse a KEY=VALUE overrides file; blank values are dropped (a missing
    GitHub secret arrives as an empty string — that must mean "leave alone",
    never "erase")."""
    if not path.exists():
        raise SeedEnvError(f"Overrides file not found: {path}")
    return {k: v for k, v in _parse_env(path.read_text(encoding="utf-8")).items()
            if v.strip()}


def _render_from_example(example_text: str, existing: dict[str, str],
                         stamps: dict[str, str],
                         overrides: dict[str, str]) -> tuple[str, dict[str, str]]:
    """Rewrite the example line-by-line (comments preserved) with resolved values.

    Returns (rendered_text, final_values). Keys in ``existing`` that the
    example does not declare are appended at the end so nothing is lost.
    """
    out_lines: list[str] = []
    final: dict[str, str] = {}
    for line in example_text.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            out_lines.append(line)
            continue
        key, _, example_value = stripped.partition("=")
        key = key.strip()
        value = _resolve_value(key, example_value.strip(), existing, stamps, overrides)
        final[key] = value
        out_lines.append(f"{key}={value}")

    extra = {k: v for k, v in existing.items() if k not in final}
    if extra:
        out_lines.append("")
        out_lines.append("# --- Preserved keys not present in the example template ---")
        for key, value in extra.items():
            value = overrides.get(key, value)
            out_lines.append(f"{key}={value}")
            final[key] = value

    return "\n".join(out_lines) + "\n", final


def _write_secure(path: Path, text: str) -> bool:
    """Write only if content changed; chmod 600 either way. Returns True if written."""
    changed = True
    if path.exists():
        changed = path.read_text(encoding="utf-8") != text
    if changed:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8", newline="\n")
    os.chmod(path, 0o600)
    return changed


def _blank_report(final: dict[str, str], enforced_keys: tuple[str, ...]) -> tuple[list[str], list[str]]:
    """Split final blank keys into (required_blanks, other_blanks)."""
    required = [k for k in enforced_keys if k in final and _is_unset(final[k])]
    other = [k for k, v in final.items() if _is_unset(v) and k not in required]
    return required, other


def seed_app(repo_root: Path, slug: str, *, domain: str | None = None,
             check_only: bool = False,
             overrides: dict[str, str] | None = None) -> int:
    """Seed (or verify, with ``check_only``) both env files for one app.

    Returns the process exit code: 0 = ready to deploy, 1 = operator values
    still blank (or, in check mode, files missing/incomplete).
    """
    app_dir = repo_root / "apps" / slug
    if not app_dir.is_dir():
        raise SeedEnvError(f"No app at {app_dir}. Known apps: "
                           + ", ".join(sorted(p.name for p in (repo_root / 'apps').iterdir() if p.is_dir())))

    compose_example = app_dir / ".env.example"
    docker_example = app_dir / "backend" / ".env.docker.example"
    for tmpl in (compose_example, docker_example):
        if not tmpl.exists():
            raise SeedEnvError(f"Missing template {tmpl} — cannot seed without it.")

    compose_env = app_dir / ".env"
    docker_env = app_dir / "backend" / ".env.docker"
    resolved_domain = domain or f"{slug}.myfreeapps.org"
    stamps = _stamps(resolved_domain)
    overrides = overrides or {}

    problems: list[str] = []

    if check_only:
        # Report-only: never write. Missing file or blank enforced key = fail.
        for path, enforced in (
            (compose_env, ("DB_PASSWORD",)),
            (docker_env, ("SECRET_KEY", "ENCRYPTION_KEY", *REQUIRED_OPERATOR_KEYS)),
        ):
            if not path.exists():
                problems.append(f"MISSING file: {path}")
                continue
            example = compose_example if path == compose_env else docker_example
            declared = _parse_env(example.read_text(encoding="utf-8"))
            current = _read_env_file(path)
            for key in enforced:
                if key not in declared and key not in current:
                    continue  # this app doesn't use the key
                if _is_unset(current.get(key, "")):
                    problems.append(f"BLANK {key} in {path}")
        if problems:
            print(f"seed_env --check FAILED for '{slug}':")
            for p in problems:
                print(f"  {p}")
            print(f"\nFix: cd {repo_root} && PYTHONPATH=packages/shared-backend "
                  f"python3 -m platform_shared.infra.seed_env --app {slug}")
            return 1
        print(f"seed_env --check OK for '{slug}': both env files present, all enforced keys set.")
        return 0

    # --- seed compose-level .env ---
    existing_compose = _read_env_file(compose_env)
    compose_text, compose_final = _render_from_example(
        compose_example.read_text(encoding="utf-8"), existing_compose, stamps, overrides,
    )
    compose_written = _write_secure(compose_env, compose_text)

    # --- seed backend/.env.docker ---
    existing_docker = _read_env_file(docker_env)
    docker_text, docker_final = _render_from_example(
        docker_example.read_text(encoding="utf-8"), existing_docker, stamps, overrides,
    )
    docker_written = _write_secure(docker_env, docker_text)

    print(f"{'Seeded' if compose_written else 'Unchanged'}: {compose_env}")
    print(f"{'Seeded' if docker_written else 'Unchanged'}: {docker_env}")
    print("Both files chmod 600.")

    applied = sorted(k for k in overrides if k in compose_final or k in docker_final)
    if applied:
        print(f"Overrides applied: {', '.join(applied)}")
    unapplied = sorted(set(overrides) - set(applied))
    if unapplied:
        print("WARNING: override keys not declared by this app's templates "
              f"(ignored): {', '.join(unapplied)}")

    required_blanks, other_blanks = _blank_report(
        {**compose_final, **docker_final},
        ("DB_PASSWORD", "SECRET_KEY", "ENCRYPTION_KEY", *REQUIRED_OPERATOR_KEYS),
    )

    if required_blanks:
        print("\nREQUIRED — fill these in before the first deploy "
              "(production boot fails loud while they are blank):")
        for key in required_blanks:
            hint = _KEY_HINTS.get(key, "")
            print(f"  {key:<26}{hint}")
        print(f"\n  vim {docker_env}")
        print("  then re-run with --check to verify:")
        print(f"  PYTHONPATH=packages/shared-backend python3 -m "
              f"platform_shared.infra.seed_env --app {slug} --check")
    if other_blanks:
        print("\nOptional / app-specific keys still blank (fill only if the app uses them):")
        for key in other_blanks:
            print(f"  {key}")

    return 1 if required_blanks else 0


def _cli(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="platform_shared.infra.seed_env",
        description="Create apps/<slug>/.env + backend/.env.docker with secrets "
                    "auto-generated and a checklist for operator-external values.",
    )
    parser.add_argument("--app", required=True, help="App slug (matches apps/<slug>/)")
    parser.add_argument("--check", action="store_true",
                        help="Report-only: verify both files exist and enforced keys "
                             "are set. Writes nothing. Exit 0 = ready to deploy.")
    parser.add_argument("--domain", default=None,
                        help="App domain (default: <slug>.myfreeapps.org). Used to "
                             "stamp FRONTEND_URL/CORS_ORIGINS when the template left them blank.")
    parser.add_argument("--repo-root", default=None,
                        help="Monorepo root (default: resolved from this file's location).")
    parser.add_argument("--overrides", default=None,
                        help="Path to a KEY=VALUE file of explicit values to set. "
                             "Overrides win over existing values (deliberate set/rotate); "
                             "blank values in the file are ignored. Used by the "
                             "seed-env GitHub Actions workflow to inject repo secrets.")
    args = parser.parse_args(argv)

    repo_root = Path(args.repo_root).resolve() if args.repo_root else _repo_root()
    try:
        overrides = _load_overrides(Path(args.overrides)) if args.overrides else None
        return seed_app(repo_root, args.app, domain=args.domain,
                        check_only=args.check, overrides=overrides)
    except SeedEnvError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(_cli())
