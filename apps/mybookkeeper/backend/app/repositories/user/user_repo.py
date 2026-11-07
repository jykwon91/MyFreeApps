import uuid
from collections.abc import Sequence

from sqlalchemy import exists, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import load_only

from platform_shared.repositories.user_repo import (
    get_by_email as _shared_get_by_email,
    get_by_email_ci as _shared_get_by_email_ci,
    get_by_id as _shared_get_by_id,
)

from app.core.account_deletion_constants import TABLES_NOT_HOLDING_SHARED_RECORDS
from app.db.base import Base
from app.models.user.user import Role, User


async def create_verified(
    db: AsyncSession, email: str, hashed_password: str, name: str,
) -> User:
    """A new active, verified, non-superuser account."""
    user = User(
        email=email,
        hashed_password=hashed_password,
        name=name,
        role=Role.USER,
        is_active=True,
        is_superuser=False,
        is_verified=True,
    )
    db.add(user)
    await db.flush()
    return user


async def list_all(db: AsyncSession) -> Sequence[User]:
    result = await db.execute(
        select(User)
        .options(load_only(
            User.id, User.email, User.name, User.role,
            User.is_active, User.is_superuser, User.is_verified,
        ))
        .order_by(User.email)
    )
    return result.scalars().all()


async def get_by_id(db: AsyncSession, user_id: uuid.UUID) -> User | None:
    return await _shared_get_by_id(db, user_id, user_model=User)


async def get_by_email(db: AsyncSession, email: str) -> User | None:
    return await _shared_get_by_email(db, email, user_model=User)


async def get_by_email_ci(db: AsyncSession, email: str) -> User | None:
    return await _shared_get_by_email_ci(db, email, user_model=User)


async def update_role(db: AsyncSession, user: User, role: Role) -> User:
    user.role = role
    return user


async def set_active(db: AsyncSession, user: User, *, is_active: bool) -> User:
    user.is_active = is_active
    return user


async def set_superuser(db: AsyncSession, user: User, *, is_superuser: bool) -> User:
    user.is_superuser = is_superuser
    return user


async def holds_shared_records(db: AsyncSession, user_id: uuid.UUID) -> bool:
    """Whether any row a user's deletion would remove or be blocked by remains.

    Reads the schema rather than a list of tables, so a table added later counts
    until someone decides otherwise. Columns that go to NULL lose nothing.
    """
    for table in Base.metadata.sorted_tables:
        if table.name in TABLES_NOT_HOLDING_SHARED_RECORDS:
            continue
        for fk in table.foreign_keys:
            if fk.column.table.name != "users" or fk.ondelete == "SET NULL":
                continue
            if await db.scalar(select(exists().where(fk.parent == user_id))):
                return True
    return False
