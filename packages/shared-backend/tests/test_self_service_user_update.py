"""The profile update body can't carry credentials or privileges."""
import pytest
from pydantic import ValidationError

from platform_shared.schemas.self_service_user_update import SelfServiceUserUpdate


class _AppUserUpdate(SelfServiceUserUpdate):
    display_name: str = ""


@pytest.mark.parametrize(
    "field, value",
    [
        ("email", "attacker@example.com"),
        ("password", "a-long-enough-password"),
        ("is_superuser", True),
        ("is_active", True),
        ("is_verified", True),
    ],
)
def test_credentials_and_privileges_are_refused(field: str, value: object) -> None:
    with pytest.raises(ValidationError):
        _AppUserUpdate(**{field: value})


def test_only_what_was_sent_is_written() -> None:
    assert _AppUserUpdate().create_update_dict() == {}
    assert _AppUserUpdate(display_name="Ada").create_update_dict() == {"display_name": "Ada"}


def test_a_superuser_update_writes_the_same_fields() -> None:
    assert _AppUserUpdate(display_name="Ada").create_update_dict_superuser() == {"display_name": "Ada"}
