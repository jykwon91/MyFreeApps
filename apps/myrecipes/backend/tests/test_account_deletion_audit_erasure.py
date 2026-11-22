"""Deleting an account through ``DELETE /users/me`` erases its content from ``audit_logs``.

The audit listener copies every recipe, ingredient, step and cook note a user
writes into ``audit_logs``, and deleting the user row adds a snapshot of their
email and name. After the deletion none of that may be readable, including
what a background worker or another user wrote about the deleted rows. Another
user's rows keep their whole history, even the parts the deleted user wrote.
"""
import uuid
from collections.abc import AsyncIterator, Iterator

import pytest
import pytest_asyncio
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import APP_SENSITIVE_FIELDS, APP_SKIP_FIELDS, APP_SKIP_TABLES
from app.core.auth import current_active_user
from app.db.session import get_db
from app.main import app
from app.models.recipe.cook_log import CookLog
from app.models.recipe.recipe import Recipe
from app.models.recipe.recipe_ingredient import RecipeIngredient
from app.models.recipe.recipe_step import RecipeStep
from app.models.recipe.recipe_version import RecipeVersion
from app.models.user.user import User
from platform_shared.db.models.audit_log import AuditLog
from platform_shared.testing.audit_erasure import (
    TEST_ACCOUNT_PASSWORD_HASH,
    assert_audit_erased,
    audit_listener_attached,
    audit_values,
    delete_account_through_route,
    last_audit_log_id,
    remove_committed_test_rows,
    write_as,
)


@pytest.fixture(autouse=True)
def _audit_listener() -> Iterator[None]:
    with audit_listener_attached(
        sensitive_fields=APP_SENSITIVE_FIELDS, skip_tables=APP_SKIP_TABLES, skip_fields=APP_SKIP_FIELDS,
    ):
        yield


@pytest_asyncio.fixture()
async def users(db: AsyncSession) -> AsyncIterator[tuple[User, User]]:
    """A user to delete and one to keep. The route commits, so clean up by hand."""
    first_audit_id = await last_audit_log_id(db)
    leaver, stayer = _user("Leaver"), _user("Stayer")
    user_ids = [leaver.id, stayer.id]
    yield leaver, stayer
    await remove_committed_test_rows(db, User, user_ids, first_audit_id)


def _user(tag: str) -> User:
    return User(
        id=uuid.uuid4(),
        email=f"{tag}-{uuid.uuid4().hex[:8]}@example.com",
        hashed_password=TEST_ACCOUNT_PASSWORD_HASH,
        is_active=True,
        is_superuser=False,
        is_verified=True,
        totp_enabled=False,
        display_name=f"{tag} Display Name",
    )


async def _seed_recipes(db: AsyncSession, user: User, tag: str) -> Recipe:
    await write_as(db, user, user)
    recipe = Recipe(user_id=user.id, title=f"{tag} Grandma Soup", description=f"{tag} recipe story")
    await write_as(db, user, recipe)
    version = RecipeVersion(recipe_id=recipe.id, user_id=user.id, version_number=1, change_note=f"{tag} first draft")
    await write_as(db, user, version)
    await write_as(
        db, user,
        RecipeIngredient(version_id=version.id, lineage_key=uuid.uuid4(), name=f"{tag} secret spice"),
        RecipeStep(version_id=version.id, instruction=f"{tag} simmer instructions"),
        CookLog(version_id=version.id, user_id=user.id, outcome_notes=f"{tag} cook outcome notes"),
    )
    recipe.description = f"{tag} edited recipe story"
    await write_as(db, user)
    return recipe


@pytest.mark.asyncio
async def test_deleting_an_account_erases_its_audit_history(
    db: AsyncSession, users: tuple[User, User],
) -> None:
    leaver, stayer = users
    leavers = await _seed_recipes(db, leaver, "Leaver")
    stayers = await _seed_recipes(db, stayer, "Stayer")
    leavers.description = "Leaver story rewritten by a worker"
    await write_as(db, None)
    leavers.description = "Leaver story rewritten by the stayer"
    await write_as(db, stayer)
    stayers.title = "Stayer title set by the leaver"
    await write_as(db, leaver)
    stayer_rows = await db.scalar(
        select(func.count()).select_from(AuditLog).where(AuditLog.changed_by == str(stayer.id)),
    )

    assert await delete_account_through_route(
        app=app, db=db, user=leaver, current_active_user=current_active_user,
        get_db=get_db, unit_of_work_path="app.api.account.unit_of_work",
    ) == 204

    assert_audit_erased(
        await audit_values(db),
        erased=[
            leaver.email, "Leaver Display Name", "Leaver Grandma Soup", "Leaver recipe story",
            "Leaver edited recipe story", "Leaver first draft", "Leaver secret spice",
            "Leaver simmer instructions", "Leaver cook outcome notes",
            "Leaver story rewritten by a worker", "Leaver story rewritten by the stayer",
        ],
        kept=[
            stayer.email, "Stayer Display Name", "Stayer Grandma Soup", "Stayer edited recipe story",
            "Stayer secret spice", "Stayer simmer instructions", "Stayer cook outcome notes",
            "Stayer title set by the leaver",
        ],
    )
    assert await db.scalar(
        select(func.count()).select_from(AuditLog).where(AuditLog.changed_by == str(stayer.id)),
    ) == stayer_rows
