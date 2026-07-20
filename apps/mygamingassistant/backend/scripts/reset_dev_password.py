"""Local-dev only: reset the operator user's password to a known value.

Seeding is idempotent (skips existing users), so changing SEED_USER_PASSWORD_HASH
+ restarting does NOT update an already-seeded user. This updates the row directly
using the SAME PasswordHelper the login path verifies with.

Usage:
    python scripts/reset_dev_password.py <email> <new_password>
"""
import asyncio
import sys

from fastapi_users.password import PasswordHelper
from sqlalchemy import select

from app.db.session import unit_of_work
from app.models.user.user import User


async def main(email: str, new_password: str) -> None:
    helper = PasswordHelper()
    new_hash = helper.hash(new_password)
    async with unit_of_work() as db:
        res = await db.execute(select(User).where(User.email == email))
        user = res.scalar_one_or_none()
        if user is None:
            print(f"NO USER: {email!r} not found")
            sys.exit(1)
        user.hashed_password = new_hash
        user.is_active = True
        user.is_verified = True
        await db.flush()
        print(f"OK: reset password for {email} (id={user.id})")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("usage: python scripts/reset_dev_password.py <email> <new_password>")
        sys.exit(2)
    asyncio.run(main(sys.argv[1], sys.argv[2]))
