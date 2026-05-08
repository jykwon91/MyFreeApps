"""Unit tests for platform_shared.schemas.pagination.ListResponse."""
from __future__ import annotations

from pydantic import BaseModel

from platform_shared.schemas.pagination import ListResponse


class _Item(BaseModel):
    id: int
    name: str


class ItemListResponse(ListResponse[_Item]):
    pass


class TestListResponse:
    def test_instantiates_with_items(self) -> None:
        items = [_Item(id=1, name="a"), _Item(id=2, name="b")]
        r = ItemListResponse(items=items, total=2, has_more=False)
        assert r.items == items
        assert r.total == 2
        assert r.has_more is False

    def test_empty_items(self) -> None:
        r = ItemListResponse(items=[], total=0, has_more=False)
        assert r.items == []
        assert r.total == 0

    def test_has_more_true(self) -> None:
        r = ItemListResponse(items=[_Item(id=1, name="x")], total=100, has_more=True)
        assert r.has_more is True

    def test_serialises(self) -> None:
        r = ItemListResponse(items=[_Item(id=1, name="z")], total=1, has_more=False)
        dumped = r.model_dump()
        assert dumped == {
            "items": [{"id": 1, "name": "z"}],
            "total": 1,
            "has_more": False,
        }

    def test_subclass_preserves_name(self) -> None:
        assert ItemListResponse.__name__ == "ItemListResponse"

    def test_from_attributes_config(self) -> None:
        assert ItemListResponse.model_config.get("from_attributes") is True

    def test_kwarg_shape(self) -> None:
        """Construction uses items, total, has_more — no positional surprises."""
        r = ListResponse[_Item](items=[], total=0, has_more=False)
        assert r.total == 0
