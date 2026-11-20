"""The recipe list's sort indexes exist in the migrated database and match the models.

CI runs ``alembic upgrade head`` before pytest, so this reflects what production gets.
"""
import pytest
from sqlalchemy import create_engine, text

from app.core.config import settings
from app.models.recipe.recipe import Recipe

PUBLIC_INDEX = "ix_recipe_live_updated_at_id"
OWNER_INDEX = "ix_recipe_user_live_updated_at_id"


def _migrated_index_defs() -> dict[str, str]:
    engine = create_engine(settings.database_url_sync)
    try:
        with engine.connect() as conn:
            rows = conn.execute(
                text("SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'recipe'")
            )
            return {name: definition for name, definition in rows}
    finally:
        engine.dispose()


def test_public_list_index_matches_order_by_and_live_filter() -> None:
    definition = _migrated_index_defs()[PUBLIC_INDEX]
    assert "(updated_at DESC, id DESC)" in definition
    assert "WHERE (deleted_at IS NULL)" in definition


def test_owner_list_index_leads_with_user_then_matches_order_by() -> None:
    definition = _migrated_index_defs()[OWNER_INDEX]
    assert "(user_id, updated_at DESC, id DESC)" in definition
    assert "WHERE (deleted_at IS NULL)" in definition


@pytest.mark.parametrize("name", [PUBLIC_INDEX, OWNER_INDEX])
def test_model_declares_the_migrated_index(name: str) -> None:
    assert name in {index.name for index in Recipe.__table__.indexes}
