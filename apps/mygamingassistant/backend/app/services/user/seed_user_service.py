"""Seed the single operator user on first boot.

MyGamingAssistant is single-user: registration is disabled at the route level.
On every startup the lifespan calls ``seed_operator_user()`` to ensure the
operator's account exists. The operation is idempotent — if the user already
exists, it's a no-op.

Boot guards (enforced in main.py _on_startup):
  - In production (ENVIRONMENT=production): if SEED_USER_EMAIL or
    SEED_USER_PASSWORD_HASH is empty the startup raises SeedUserNotConfiguredError
    so the deploy healthcheck fails immediately rather than booting a server
    the operator can never log into.
  - In production: if SEED_USER_EMAIL is set but not a syntactically valid
    email, the startup raises SeedUserInvalidEmailError. fastapi-users
    serializes the operator through an ``EmailStr`` field (UserRead), so an
    invalid address makes ``GET /users/me`` return 500 on every authenticated
    request — a silent, hard-to-diagnose failure. Fail loud at boot instead.
  - In development: if either var is empty OR the email is invalid, log and
    skip the seed (do not create an operator that 500s /users/me).

The password is stored as a bcrypt hash. Never store plaintext.

To generate the hash:
    python -c "from passlib.context import CryptContext; \
      ctx = CryptContext(schemes=['bcrypt']); \
      print(ctx.hash('your-password'))"

Then set SEED_USER_PASSWORD_HASH in backend/.env.docker.
"""
import logging

from app.db.session import unit_of_work
from app.repositories.user import user_repo

logger = logging.getLogger(__name__)


class SeedUserNotConfiguredError(RuntimeError):
    """Raised in production when SEED_USER_EMAIL or SEED_USER_PASSWORD_HASH is empty."""


class SeedUserInvalidEmailError(RuntimeError):
    """Raised in production when SEED_USER_EMAIL is set but not a valid email."""


def is_valid_seed_email(email: str) -> bool:
    """Return True if *email* passes the same validation fastapi-users'
    ``UserRead.email`` (Pydantic ``EmailStr``) applies at response time.

    Pydantic v2 ``EmailStr`` delegates to ``email-validator`` with
    ``check_deliverability=False`` (no DNS/network). We mirror that exactly so
    this boot check accepts/rejects precisely what the response schema will —
    catching ``dev@localhost``-style addresses (no dot in the domain) before
    they seed an operator whose ``GET /users/me`` then 500s on every call.

    The DNS check is deliberately disabled: it matches Pydantic, avoids a
    network call on the startup path, and keeps the check deterministic in CI.
    """
    if not email:
        return False
    try:
        from email_validator import EmailNotValidError, validate_email
    except ImportError:  # pragma: no cover - ships with pydantic[email]/fastapi-users
        # Minimal structural fallback: local-part@domain with a dotted domain.
        parts = email.split("@")
        return len(parts) == 2 and bool(parts[0]) and "." in parts[1]
    try:
        validate_email(email, check_deliverability=False)
        return True
    except EmailNotValidError:
        return False


async def seed_operator_user(email: str, hashed_password: str) -> None:
    """Ensure the operator user exists. Idempotent — safe to call on every boot.

    Args:
        email: The operator's email address (from SEED_USER_EMAIL).
        hashed_password: A bcrypt hash (from SEED_USER_PASSWORD_HASH).

    Raises:
        SeedUserNotConfiguredError: If email or hashed_password is empty in production.
    """
    async with unit_of_work() as db:
        existing = await user_repo.get_by_email(db, email)
        if existing is not None:
            logger.info("seed_operator_user: user %s already exists — skipping", email)
            return

        await user_repo.create_seed_user(db, email=email, hashed_password=hashed_password)
        logger.info("seed_operator_user: created operator user %s", email)
