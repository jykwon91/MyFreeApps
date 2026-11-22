"""Deleting an account through ``DELETE /users/me`` erases its content from ``audit_logs``.

The audit listener copies every tutor turn a learner writes (their message, the
tutor's reply, corrections, translations) into ``audit_logs``, and deleting the user row adds a snapshot of their
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
from app.domain.languages import LANGUAGE_CODES
from app.domain.levels import LEVEL_CODES
from app.domain.scenarios import SCENARIO_SLUGS
from app.domain.session_status import SESSION_STATUS_CODES
from app.domain.turn_status import TURN_STATUS_CODES
from app.main import app
from app.models.tutor.tutor_session import TutorSession
from app.models.tutor.tutor_turn import TutorTurn
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


async def _seed_tutoring(db: AsyncSession, user: User, tag: str) -> None:
    await write_as(db, user, user)
    session = TutorSession(
        user_id=user.id, language_code=LANGUAGE_CODES[0], scenario_slug=SCENARIO_SLUGS[0],
        level=LEVEL_CODES[0], status=SESSION_STATUS_CODES[0],
    )
    await write_as(db, user, session)
    turn = TutorTurn(
        session_id=session.id, user_id=user.id, seq=1, learner_text=f"{tag} learner message",
        status=TURN_STATUS_CODES[0],
    )
    await write_as(db, user, turn)
    turn.reply_text = f"{tag} tutor reply"
    turn.translation_text = f"{tag} translation"
    await write_as(db, user)


@pytest.mark.asyncio
async def test_deleting_an_account_erases_its_audit_history(
    db: AsyncSession, users: tuple[User, User],
) -> None:
    leaver, stayer = users
    await _seed_tutoring(db, leaver, "Leaver")
    await _seed_tutoring(db, stayer, "Stayer")
    leaver.display_name = "Leaver name set by a worker"
    await write_as(db, None)
    leaver.display_name = "Leaver name set by the stayer"
    await write_as(db, stayer)
    stayer.display_name = "Stayer name set by the leaver"
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
            leaver.email, "Leaver Display Name", "Leaver learner message", "Leaver tutor reply",
            "Leaver translation", "Leaver name set by a worker", "Leaver name set by the stayer",
        ],
        kept=[
            stayer.email, "Stayer Display Name", "Stayer name set by the leaver",
        ],
    )
    assert await db.scalar(
        select(func.count()).select_from(AuditLog).where(AuditLog.changed_by == str(stayer.id)),
    ) == stayer_rows
