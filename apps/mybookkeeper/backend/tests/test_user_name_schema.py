import pytest
from pydantic import ValidationError

from app.schemas.user.user import UserCreate, UserUpdate

# UserUpdate takes no credentials, so sending them would fail for the wrong reason.
SCHEMAS = [(UserCreate, {"email": "user@example.com", "password": "pw"}), (UserUpdate, {})]


@pytest.mark.parametrize(("schema", "base"), SCHEMAS, ids=["create", "update"])
@pytest.mark.parametrize(
    ("raw", "stored"),
    [(None, None), ("", None), ("   ", None), ("Ada", "Ada"), ("  Ada  ", "Ada"), ("x" * 255, "x" * 255)],
)
def test_valid_name_is_accepted(schema: type, base: dict[str, str], raw: str | None, stored: str | None) -> None:
    assert schema(**base, name=raw).name == stored


@pytest.mark.parametrize(("schema", "base"), SCHEMAS, ids=["create", "update"])
@pytest.mark.parametrize("raw", ["x" * 256, "a\x00b"])
def test_name_the_column_cannot_store_is_rejected(schema: type, base: dict[str, str], raw: str) -> None:
    with pytest.raises(ValidationError, match="name"):
        schema(**base, name=raw)


def test_omitting_name_leaves_it_unchanged_on_update() -> None:
    assert "name" not in UserUpdate().create_update_dict()
