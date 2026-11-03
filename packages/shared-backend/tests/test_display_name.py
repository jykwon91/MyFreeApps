import pytest
from pydantic import TypeAdapter, ValidationError

from platform_shared.schemas.display_name import DISPLAY_NAME_MAX_LENGTH, DisplayName

_adapter = TypeAdapter(DisplayName)


@pytest.mark.parametrize(
    ("raw", "stored"),
    [
        ("", ""),
        ("Ada", "Ada"),
        ("   ", ""),
        ("  Ada  ", "Ada"),
        ("x" * DISPLAY_NAME_MAX_LENGTH, "x" * DISPLAY_NAME_MAX_LENGTH),
        (" " + "x" * DISPLAY_NAME_MAX_LENGTH + " ", "x" * DISPLAY_NAME_MAX_LENGTH),
    ],
)
def test_accepts_and_normalizes(raw: str, stored: str) -> None:
    assert _adapter.validate_python(raw) == stored


@pytest.mark.parametrize("raw", [None, "x" * (DISPLAY_NAME_MAX_LENGTH + 1), "a\x00b"])
def test_rejects(raw: str | None) -> None:
    with pytest.raises(ValidationError):
        _adapter.validate_python(raw)
