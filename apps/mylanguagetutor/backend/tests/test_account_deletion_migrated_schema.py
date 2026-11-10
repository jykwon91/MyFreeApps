"""Account-deletion foreign-key guard against the migrated database.

CI runs ``alembic upgrade head`` before pytest, so this reflects what
production gets, catching a migration that drifts from the models.
"""
from sqlalchemy import create_engine

from app.core.config import settings
from app.models.user.user import User
from platform_shared.testing.account_deletion_assertions import assert_user_foreign_keys_safe
from platform_shared.testing.account_deletion_schema import reflect_schema


def test_migrated_schema_cannot_block_account_deletion() -> None:
    engine = create_engine(settings.database_url_sync)
    try:
        metadata = reflect_schema(engine)
    finally:
        engine.dispose()
    assert_user_foreign_keys_safe(metadata, User.__table__.name)
