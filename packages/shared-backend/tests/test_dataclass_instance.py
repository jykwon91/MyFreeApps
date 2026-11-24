"""is_dataclass_instance: the objects the Sentry hooks look inside and write as their repr."""

from __future__ import annotations

import pytest

from platform_shared.core.dataclass_instance import is_dataclass_instance
from tests.import_outcome import ImportOutcome


def test_an_instance_of_a_dataclass_is_one() -> None:
    assert is_dataclass_instance(ImportOutcome(row=1, error=None))


@pytest.mark.parametrize("value", [ImportOutcome, object(), {"row": 1}, None, "text"])
def test_anything_else_is_not(value: object) -> None:
    assert not is_dataclass_instance(value)
