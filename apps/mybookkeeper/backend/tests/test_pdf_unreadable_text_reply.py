"""A PDF whose text read comes back unreadable gets a second read by image.

Before, an unreadable reply became a low-confidence placeholder, which
counts as a poor result and was re-read by image. Now the reply raises
ExtractionParseError; the PDF path keeps the same second chance, and only a
failed image read reaches the upload worker's retry.
"""
import uuid
from unittest.mock import AsyncMock, patch

import pytest
from platform_shared.extraction import ExtractionParseError, ExtractionTruncatedError

from app.services.extraction import document_extraction_service as svc

_TEXT = "Invoice text here with enough content to pass the 50 char check easily."
_GOOD = {"data": [{"vendor": "Acme", "amount": "10.00"}], "tokens": 5}


async def test_unreadable_text_reply_is_read_again_by_image() -> None:
    with (
        patch.object(svc, "extract_text_from_pdf", AsyncMock(return_value=_TEXT)),
        patch.object(svc, "extract_from_text", AsyncMock(side_effect=ExtractionParseError("bad"))),
        patch.object(svc, "extract_from_image", AsyncMock(return_value=_GOOD)) as image,
    ):
        result = await svc._run_claude_extraction(
            b"%PDF", "a.pdf", "application/pdf", "pdf", uuid.uuid4(), uuid.uuid4(),
        )

    assert result == _GOOD
    image.assert_awaited_once()


async def test_unreadable_image_reply_is_raised_for_the_worker_to_retry() -> None:
    with (
        patch.object(svc, "extract_text_from_pdf", AsyncMock(return_value=_TEXT)),
        patch.object(svc, "extract_from_text", AsyncMock(side_effect=ExtractionParseError("bad"))),
        patch.object(svc, "extract_from_image", AsyncMock(side_effect=ExtractionParseError("bad"))),
        pytest.raises(ExtractionParseError),
    ):
        await svc._run_claude_extraction(
            b"%PDF", "a.pdf", "application/pdf", "pdf", uuid.uuid4(), uuid.uuid4(),
        )


async def test_a_cut_off_text_reply_is_not_read_again_by_image() -> None:
    # Cut off at the output limit means the document has more than one reply
    # holds; a vision read would be cut off the same way and cost a second
    # full read. The worker retries it and then says why it failed.
    image = AsyncMock(return_value=_GOOD)
    with (
        patch.object(svc, "extract_text_from_pdf", AsyncMock(return_value=_TEXT)),
        patch.object(svc, "extract_from_text", AsyncMock(side_effect=ExtractionTruncatedError("cut off"))),
        patch.object(svc, "extract_from_image", image),
        pytest.raises(ExtractionTruncatedError),
    ):
        await svc._run_claude_extraction(
            b"%PDF", "a.pdf", "application/pdf", "pdf", uuid.uuid4(), uuid.uuid4(),
        )

    image.assert_not_awaited()
