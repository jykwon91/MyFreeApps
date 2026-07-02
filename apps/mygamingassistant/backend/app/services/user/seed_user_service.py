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

# Extracted to platform_shared when the multi-user SEED_ADMIN_* standard became
# the second consumer (auto-promote rule). Re-exported so existing imports of
# app.services.user.seed_user_service.is_valid_seed_email keep working.
from platform_shared.services.seed_admin_service import is_valid_seed_email  # noqa: F401

from app.db.session import unit_of_work
from app.repositories.user import user_repo

logger = logging.getLogger(__name__)


class SeedUserNotConfiguredError(RuntimeError):
    """Raised in production when SEED_USER_EMAIL or SEED_USER_PASSWORD_HASH is empty."""


class SeedUserInvalidEmailError(RuntimeError):
    """Raised in production when SEED_USER_EMAIL is set but not a valid email."""


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
