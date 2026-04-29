"""Shared-backend test config — registers asyncio mode for pytest-asyncio."""
import pytest


@pytest.fixture
def anyio_backend() -> str:
    """Force ``anyio``-marked tests onto asyncio (no Trio in our test deps)."""
    return "asyncio"
