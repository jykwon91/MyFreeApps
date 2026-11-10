"""Guards that keep account deletion from silently leaving user data behind.

Deleting an account relies on the database: every foreign key to the user
cascades and nothing blocks the delete. The app stores no user-owned files, so
nothing needs cleaning up outside the database. These tests fail the moment
either assumption stops being true, so the change can't ship without deciding
what deletion does.
"""
import app.models
from app.db.base import Base
from app.models.user.user import User
from platform_shared.testing.account_deletion_assertions import assert_account_deletion_schema
from platform_shared.testing.model_loading import load_all_models

load_all_models(app.models)

USER_TABLE = User.__table__.name

# Columns that look like stored-file references but are not, with the reason.
NOT_STORED_FILE_COLUMNS: dict[str, str] = {
    "daily_usage_counters.bucket": "Quota counter name, not a storage bucket",
}


def test_account_deletion_cannot_leave_data_behind() -> None:
    assert_account_deletion_schema(
        Base.metadata, USER_TABLE, not_stored_files=NOT_STORED_FILE_COLUMNS,
    )
