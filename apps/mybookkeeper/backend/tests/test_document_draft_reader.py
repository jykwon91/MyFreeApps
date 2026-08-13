"""Tests for the fetch-and-coerce half of document reading.

This module is what the utility and insurance readers have in common, so a bug
here is a bug in both domains at once. Two things are worth guarding: which
representation a file is sent to the model as (text is cheaper and reads a real
text layer better; vision is the only thing that reads a scan), and the
coercions, which are the last gate before an untrusted number reaches a form.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from decimal import Decimal
from unittest.mock import AsyncMock, patch

import pytest

from app.services.extraction import document_draft_reader as reader

RATE_PLACES = "0.0001"


class TestCoercers:
    def test_text_is_trimmed_and_capped(self) -> None:
        assert reader.as_text("  Rhythm  ", max_length=255) == "Rhythm"
        assert reader.as_text("x" * 300, max_length=10) == "x" * 10

    def test_a_blank_string_is_not_a_value(self) -> None:
        assert reader.as_text("   ", max_length=255) is None

    def test_a_negative_int_is_dropped_as_a_misread(self) -> None:
        # A negative fee is not a discount the document offered; it is a
        # minus sign the model picked up off the surrounding layout.
        assert reader.as_int(-500) is None

    def test_a_stated_zero_survives(self) -> None:
        assert reader.as_int(0) == 0

    def test_a_boolean_is_not_an_int(self) -> None:
        # ``int(True)`` is 1, which would silently become a $0.01 fee.
        assert reader.as_int(True) is None

    def test_an_unparseable_int_is_dropped(self) -> None:
        assert reader.as_int("about a hundred") is None

    def test_a_decimal_keeps_the_precision_it_was_asked_for(self) -> None:
        assert reader.as_decimal("5.3509", places=RATE_PLACES) == Decimal("5.3509")
        assert reader.as_decimal("2", places="0.01") == Decimal("2.00")

    def test_a_negative_decimal_is_dropped(self) -> None:
        assert reader.as_decimal("-1.0", places=RATE_PLACES) is None

    def test_a_date_is_read_off_a_timestamp_prefix(self) -> None:
        assert reader.as_date("2026-02-17T00:00:00Z") == _dt.date(2026, 2, 17)

    def test_an_unparseable_date_is_dropped(self) -> None:
        assert reader.as_date("February") is None

    def test_a_string_list_keeps_only_strings(self) -> None:
        assert reader.as_string_list(["a", 1, None, " b "]) == ["a", "b"]

    def test_a_non_list_is_an_empty_list(self) -> None:
        assert reader.as_string_list("a, b") == []

    def test_an_unknown_enum_value_is_dropped(self) -> None:
        # Worse than an empty select: the operator would have to notice the
        # pre-selected value was wrong rather than simply pick one.
        assert reader.known("fixed_rate", {"fixed", "variable"}) is None

    def test_a_known_enum_value_is_normalized(self) -> None:
        assert reader.known("  Fixed ", {"fixed", "variable"}) == "fixed"


@pytest.mark.asyncio
class TestExtractRaw:
    async def test_an_unsupported_file_type_is_reported_not_sent_to_the_model(
        self,
    ) -> None:
        run = AsyncMock()

        with pytest.raises(reader.UnreadableDocumentError):
            await reader.extract_raw(
                b"x",
                "zip",
                "",
                run=run,
                user_id=uuid.uuid4(),
                unsupported_message="nope",
            )

        run.assert_not_called()

    async def test_a_pdf_with_a_real_text_layer_is_read_as_text(self) -> None:
        """Vision on a text PDF costs more and reads no better."""
        run = AsyncMock(return_value={})
        with patch.object(
            reader, "extract_text_from_pdf", new=AsyncMock(return_value="x" * 200),
        ):
            await reader.extract_raw(
                b"pdf",
                "pdf",
                "",
                run=run,
                user_id=uuid.uuid4(),
                unsupported_message="nope",
            )

        assert run.await_args.kwargs.get("text") is not None
        assert run.await_args.kwargs.get("image_bytes") is None

    async def test_a_scanned_pdf_falls_back_to_vision(self) -> None:
        """A scan has no text layer — the numbers are only in the pixels."""
        run = AsyncMock(return_value={})
        with patch.object(
            reader, "extract_text_from_pdf", new=AsyncMock(return_value=""),
        ):
            await reader.extract_raw(
                b"pdf",
                "pdf",
                "",
                run=run,
                user_id=uuid.uuid4(),
                unsupported_message="nope",
            )

        assert run.await_args.kwargs.get("image_bytes") == b"pdf"

    async def test_an_image_carries_its_own_media_type(self) -> None:
        run = AsyncMock(return_value={})

        await reader.extract_raw(
            b"png",
            "image",
            "image/png",
            run=run,
            user_id=uuid.uuid4(),
            unsupported_message="nope",
        )

        assert run.await_args.kwargs.get("media_type") == "image/png"
