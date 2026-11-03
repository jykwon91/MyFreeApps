import pytest
from pydantic import ValidationError

from app.schemas.user.user import UserCreate, UserUpdate

BASE = {"email": "user@example.com", "password": "pw"}


@pytest.mark.parametrize("schema", [UserCreate, UserUpdate])
@pytest.mark.parametrize(
    ("raw", "stored"),
    [(None, None), ("", None), ("   ", None), ("Ada", "Ada"), ("  Ada  ", "Ada"), ("x" * 255, "x" * 255)],
)
def test_valid_name_is_accepted(schema: type, raw: str | None, stored: str | None) -> None:
    assert schema(**BASE, name=raw).name == stored


@pytest.mark.parametrize("schema", [UserCreate, UserUpdate])
@pytest.mark.parametrize("raw", ["x" * 256, "a\x00b"])
def test_name_the_column_cannot_store_is_rejected(schema: type, raw: str) -> None:
    with pytest.raises(ValidationError):
        schema(**BASE, name=raw)


def test_omitting_name_leaves_it_unchanged_on_update() -> None:
    assert "name" not in UserUpdate().create_update_dict()
