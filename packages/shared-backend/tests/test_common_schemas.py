"""Unit tests for platform_shared.schemas.common."""
from platform_shared.schemas.common import CountResponse, StatusResponse, SuccessResponse


class TestStatusResponse:
    def test_valid(self) -> None:
        r = StatusResponse(status="ok")
        assert r.status == "ok"

    def test_serialises(self) -> None:
        assert StatusResponse(status="done").model_dump() == {"status": "done"}


class TestCountResponse:
    def test_valid(self) -> None:
        r = CountResponse(count=42)
        assert r.count == 42

    def test_serialises(self) -> None:
        assert CountResponse(count=0).model_dump() == {"count": 0}


class TestSuccessResponse:
    def test_true(self) -> None:
        r = SuccessResponse(success=True)
        assert r.success is True

    def test_false(self) -> None:
        r = SuccessResponse(success=False)
        assert r.success is False

    def test_serialises(self) -> None:
        assert SuccessResponse(success=True).model_dump() == {"success": True}
