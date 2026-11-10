"""Guards that keep account deletion from silently leaving user data behind.

Deleting an account relies on the database: every foreign key to the user
cascades and nothing blocks the delete. The lineup library is shared content that
outlives the account (uploaded files sit under a ``<user_id>/...`` prefix that only
records the uploader). These tests fail the moment
either assumption stops being true, so the change can't ship without deciding
what deletion does.
"""
import app.models
from app.db.base import Base
from app.models.user.user import User
from platform_shared.testing.account_deletion_assertions import assert_account_deletion_schema
from platform_shared.testing.account_deletion_schema import tables_referencing
from platform_shared.testing.model_loading import load_all_models

load_all_models(app.models)

USER_TABLE = User.__table__.name
TABLES_OWNED_BY_THE_USER = {"refresh_sessions"}

SHARED_LINEUP_MEDIA = "Shared lineup media, not user-owned; outlives the account"

# Look like stored-file references but are not (or are shared content), with the reason.
NOT_STORED_FILE_COLUMNS: dict[str, str] = {
    "daily_usage_counters.bucket": "Quota counter name, not a storage bucket",
    "lineup.aim_clip_url": SHARED_LINEUP_MEDIA,
    "lineup.aim_screenshot_url": SHARED_LINEUP_MEDIA,
    "lineup.clip_url": SHARED_LINEUP_MEDIA,
    "lineup.landing_clip_url": SHARED_LINEUP_MEDIA,
    "lineup.landing_screenshot_url": SHARED_LINEUP_MEDIA,
    "lineup.stand_clip_url": SHARED_LINEUP_MEDIA,
    "lineup.stand_screenshot_url": SHARED_LINEUP_MEDIA,
    "lineup.attribution_url": "External link to the lineup's source video, not a stored file",
    "map.minimap_url": "Shared map reference media; not user-owned",
    "wow_feature_story.shipped_path": "Site-relative /wow-forever page path, not a file",
    "wow_feature_vote.voter_key": "Anonymous hashed voter identity, not a file",
    "wow_map_capture.capture_key": "Idempotency key for re-importing a capture, not a file",
    "wow_raid_event.image_url": "External https banner link, not a stored file",
    "wow_raid_event.raid_key": "Short raid slug (mc, onyxia), not a file",
}


def test_account_deletion_cannot_leave_data_behind() -> None:
    assert_account_deletion_schema(
        Base.metadata, USER_TABLE, not_stored_files=NOT_STORED_FILE_COLUMNS,
    )


def test_only_refresh_sessions_reference_the_user() -> None:
    referencing = tables_referencing(Base.metadata, USER_TABLE)
    assert referencing == TABLES_OWNED_BY_THE_USER, (
        f"Tables referencing {USER_TABLE} changed to {sorted(referencing)}. Adding "
        "ownership (e.g. lineup.owner_id) requires deciding what account deletion does "
        "with that content: delete it, keep it as shared library content, or reassign it."
    )
