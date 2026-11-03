import pytest
from pydantic import ValidationError

from app.schemas.user.user_base import UserCreate


def test_blank_display_name_is_accepted() -> None:
    user = UserCreate(email="user@example.com", password="pw", display_name="")
    assert user.display_name == ""


def test_null_display_name_is_rejected() -> None:
    """The register form must send a blank string for an empty optional name."""
    with pytest.raises(ValidationError):
        UserCreate(email="user@example.com", password="pw", display_name=None)
