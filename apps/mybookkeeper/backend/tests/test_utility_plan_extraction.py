"""Tests for reading a utility plan out of a document.

The model's output is untrusted input. These tests are mostly about what
happens when it is wrong — a hallucinated enum, a negative fee, a rate with two
decimal places, a bare list instead of an object — because the failure mode
that matters is not "extraction failed" (visible) but "extraction produced a
plausible wrong number" (invisible, and it ends up in a price comparison).
"""
from __future__ import annotations

import datetime as _dt
import uuid
from decimal import Decimal
from unittest.mock import AsyncMock, patch

import pytest

from app.core.context import RequestContext
from app.models.organization.organization_member import OrgRole
from app.services.properties import utility_plan_extraction_service as svc

DOC_ID = uuid.uuid4()


def _draft(**raw):
    return svc.build_draft(raw, document_id=DOC_ID)


def _upload_ctx() -> RequestContext:
    return RequestContext(
        organization_id=uuid.uuid4(), user_id=uuid.uuid4(), org_role=OrgRole.OWNER,
    )


class TestBuildDraftReadsWhatIsThere:
    def test_a_full_efl_reading_round_trips(self) -> None:
        draft = _draft(
            service_type="electricity",
            provider_name="Constellation",
            plan_name="12 Month Usage Bill Credit",
            account_number="204430810",
            rate_type="fixed",
            energy_charge_cents_per_kwh="14.1100",
            avg_price_cents_per_kwh_at_1000="17.1000",
            monthly_base_charge_cents=0,
            term_months=12,
            service_start_date="2026-02-17",
            term_end_date="2027-02-17",
            early_termination_fee_cents=15000,
            has_bill_credit=True,
            bill_credit_amount_cents=3500,
            bill_credit_threshold_kwh=1000,
            min_usage_fee_cents=0,
            confidence="high",
        )

        assert draft.service_type == "electricity"
        assert draft.energy_charge_cents_per_kwh == Decimal("14.1100")
        assert draft.term_end_date == _dt.date(2027, 2, 17)
        assert draft.early_termination_fee_cents == 15000
        assert draft.has_bill_credit is True
        assert draft.confidence == "high"
        assert draft.source_document_id == DOC_ID

    def test_a_stated_zero_survives_as_zero(self) -> None:
        """0 and null are different answers, and the difference is load-bearing.

        "Minimum Usage Fee: $0.00" is a recorded fact; a plan that never
        mentions one is unknown. Collapsing them would let a plan with a real
        fee look identical to one that promises none.
        """
        draft = _draft(min_usage_fee_cents=0, monthly_base_charge_cents=0)

        assert draft.min_usage_fee_cents == 0
        assert draft.monthly_base_charge_cents == 0

    def test_an_empty_reading_is_an_empty_draft_not_an_error(self) -> None:
        draft = _draft()

        assert draft.provider_name is None
        assert draft.has_bill_credit is False
        assert draft.confidence == "low"
        assert draft.warnings == []
        assert draft.unrepresented == []

    def test_internet_fields_are_read_without_touching_the_kwh_ones(self) -> None:
        draft = _draft(
            service_type="internet",
            rate_type="fixed",
            monthly_base_charge_cents=5500,
            post_promo_monthly_cents=9500,
            equipment_fee_monthly_cents=1000,
            download_mbps=1000,
            upload_mbps=1000,
            data_cap_gb=1200,
            term_end_date="2027-02-17",
        )

        assert draft.download_mbps == 1000
        assert draft.data_cap_gb == 1200
        assert draft.energy_charge_cents_per_kwh is None
        assert draft.avg_price_cents_per_kwh_at_1000 is None


class TestBuildDraftRefusesJunk:
    @pytest.mark.parametrize("value", ["fixed_rate", "FIXED RATE", "", None, 12, []])
    def test_an_unknown_rate_type_is_dropped_not_passed_through(self, value) -> None:
        """A hallucinated enum would fail the DB CHECK — as a 500, at save time.

        Dropping it leaves the select empty, which the operator fills in. A
        wrong preselected value is worse: it has to be noticed to be fixed.
        """
        assert _draft(rate_type=value).rate_type is None

    @pytest.mark.parametrize("value", ["electric", "power", "fibre"])
    def test_a_near_miss_service_type_is_dropped(self, value) -> None:
        assert _draft(service_type=value).service_type is None

    def test_a_known_value_in_the_wrong_case_is_accepted(self) -> None:
        """The value is unambiguous; rejecting it would discard a correct read."""
        assert _draft(rate_type="Fixed").rate_type == "fixed"
        assert _draft(service_type="ELECTRICITY").service_type == "electricity"

    @pytest.mark.parametrize(
        "field", ["early_termination_fee_cents", "monthly_base_charge_cents"],
    )
    def test_a_negative_amount_is_dropped(self, field) -> None:
        """No money field on this table can be negative; a minus sign is a misread."""
        assert getattr(_draft(**{field: -1500}), field) is None

    def test_a_negative_rate_is_dropped(self) -> None:
        assert _draft(energy_charge_cents_per_kwh="-10.0").energy_charge_cents_per_kwh is None

    @pytest.mark.parametrize("value", ["$150.00", "1,500", "n/a", "", "about 15"])
    def test_an_unparseable_amount_is_dropped_not_coerced(self, value) -> None:
        assert _draft(early_termination_fee_cents=value).early_termination_fee_cents is None

    def test_a_rate_is_carried_to_four_decimal_places(self) -> None:
        """5.3509 rounded to 5.35 misprices every comparison built on it."""
        assert _draft(
            tdu_charge_cents_per_kwh="5.3509",
        ).tdu_charge_cents_per_kwh == Decimal("5.3509")

    def test_a_short_rate_is_padded_rather_than_left_ragged(self) -> None:
        assert _draft(
            energy_charge_cents_per_kwh="10",
        ).energy_charge_cents_per_kwh == Decimal("10.0000")

    @pytest.mark.parametrize("value", ["2026-13-45", "Feb 17 2026", "", None])
    def test_an_unparseable_date_is_dropped(self, value) -> None:
        assert _draft(term_end_date=value).term_end_date is None

    def test_a_truthy_non_boolean_does_not_claim_a_bill_credit(self) -> None:
        """has_bill_credit is NOT NULL and gates two other columns."""
        assert _draft(has_bill_credit="yes").has_bill_credit is False
        assert _draft(has_bill_credit=1).has_bill_credit is False
        assert _draft(has_bill_credit=True).has_bill_credit is True

    def test_unrepresented_survives_only_as_a_list_of_strings(self) -> None:
        assert _draft(unrepresented="a string").unrepresented == []
        assert _draft(unrepresented=[1, None, "  ", "real term"]).unrepresented == [
            "real term",
        ]

    def test_an_unknown_confidence_falls_back_to_low(self) -> None:
        assert _draft(confidence="certain").confidence == "low"
        assert _draft(confidence="high").confidence == "high"


class TestDraftWarnings:
    def test_an_old_tdu_rate_is_flagged_as_possibly_stale(self) -> None:
        """The exact 2026-08-11 failure: an EFL's 6.0009 vs a current 5.1461."""
        draft = _draft(
            tdu_charge_cents_per_kwh="6.0009",
            document_issued_date="2025-12-05",
        )

        assert any("TDU" in w for w in draft.warnings)

    def test_a_tdu_rate_with_no_document_date_is_also_flagged(self) -> None:
        """Unknown age is not the same as young."""
        assert any("TDU" in w for w in _draft(tdu_charge_cents_per_kwh="5.1461").warnings)

    def test_a_freshly_issued_tdu_rate_is_not_flagged(self) -> None:
        recent = (_dt.date.today() - _dt.timedelta(days=5)).isoformat()

        draft = _draft(tdu_charge_cents_per_kwh="5.1461", document_issued_date=recent)

        assert draft.warnings == []

    def test_no_tdu_rate_means_no_tdu_warning(self) -> None:
        assert _draft(energy_charge_cents_per_kwh="10.0000").warnings == []

    def test_half_a_bill_credit_is_flagged_rather_than_silently_unsavable(self) -> None:
        """The CHECK constraint rejects the pair; the form should say why first."""
        draft = _draft(has_bill_credit=True, bill_credit_amount_cents=3500)

        assert any("bill credit" in w for w in draft.warnings)

    def test_a_complete_bill_credit_is_not_flagged(self) -> None:
        draft = _draft(
            has_bill_credit=True,
            bill_credit_amount_cents=3500,
            bill_credit_threshold_kwh=1000,
        )

        assert draft.warnings == []

    def test_a_post_promo_price_with_no_end_date_is_flagged(self) -> None:
        draft = _draft(post_promo_monthly_cents=9500)

        assert any("promotional" in w for w in draft.warnings)

    def test_a_post_promo_price_with_an_end_date_is_not_flagged(self) -> None:
        draft = _draft(post_promo_monthly_cents=9500, term_end_date="2027-02-17")

        assert draft.warnings == []


@pytest.mark.asyncio
class TestExtractPlanFromDocument:
    async def test_a_document_from_another_org_is_not_found(self) -> None:
        with patch.object(
            svc, "_load_document", side_effect=svc.DocumentNotFoundError(str(DOC_ID)),
        ):
            with pytest.raises(svc.DocumentNotFoundError):
                await svc.extract_plan_from_document(
                    user_id=uuid.uuid4(),
                    organization_id=uuid.uuid4(),
                    document_id=DOC_ID,
                )

    async def test_a_non_dict_response_degrades_to_an_empty_draft(self) -> None:
        """The model ignoring the contract must not 500 the request."""
        with patch.object(
            svc, "_load_document", new=AsyncMock(return_value=(b"x", "pdf", "")),
        ):
            with patch.object(
                svc, "_extract_raw", new=AsyncMock(return_value=["not", "an", "object"]),
            ):
                draft = await svc.extract_plan_from_document(
                    user_id=uuid.uuid4(),
                    organization_id=uuid.uuid4(),
                    document_id=DOC_ID,
                )

        assert draft.provider_name is None
        assert draft.confidence == "low"
        assert draft.source_document_id == DOC_ID

    async def test_an_unsupported_file_type_is_reported_not_sent_to_the_model(
        self,
    ) -> None:
        with patch.object(
            svc, "run_utility_plan_extraction", new=AsyncMock(),
        ) as mock_model:
            with pytest.raises(svc.UnreadableDocumentError):
                await svc._extract_raw(b"x", "zip", "", user_id=uuid.uuid4())

        mock_model.assert_not_called()

    async def test_a_pdf_with_a_real_text_layer_is_read_as_text(self) -> None:
        """Vision on a text PDF costs more and reads no better."""
        with patch.object(
            svc, "extract_text_from_pdf", new=AsyncMock(return_value="x" * 200),
        ):
            with patch.object(
                svc, "run_utility_plan_extraction", new=AsyncMock(return_value={}),
            ) as mock_model:
                await svc._extract_raw(b"pdf", "pdf", "", user_id=uuid.uuid4())

        assert mock_model.await_args.kwargs.get("text") is not None
        assert mock_model.await_args.kwargs.get("image_bytes") is None

    async def test_a_scanned_pdf_falls_back_to_vision(self) -> None:
        """A scanned EFL has no text layer — the numbers are only in the pixels."""
        with patch.object(svc, "extract_text_from_pdf", new=AsyncMock(return_value="")):
            with patch.object(
                svc, "run_utility_plan_extraction", new=AsyncMock(return_value={}),
            ) as mock_model:
                await svc._extract_raw(b"pdf", "pdf", "", user_id=uuid.uuid4())

        assert mock_model.await_args.kwargs.get("image_bytes") == b"pdf"


@pytest.mark.asyncio
class TestExtractPlanFromUpload:
    """Bytes in, draft out — the path a phone takes with no library to point at."""

    async def test_the_file_is_stored_as_reference_material(self) -> None:
        """Stored any other way, the transaction extractor invents an expense.

        This assertion is the whole reason the dialog can offer an upload at
        all; drop it and the feature silently starts dirtying the books.
        """
        document_id = uuid.uuid4()
        with patch.object(
            svc.document_upload_service,
            "accept_upload",
            new=AsyncMock(return_value={"document_id": str(document_id)}),
        ) as mock_upload:
            with patch.object(
                svc, "_load_document", new=AsyncMock(return_value=(b"x", "pdf", "")),
            ):
                with patch.object(
                    svc,
                    "_extract_raw",
                    new=AsyncMock(return_value={"provider_name": "Rhythm"}),
                ):
                    draft = await svc.extract_plan_from_upload(
                        ctx=_upload_ctx(),
                        content=b"%PDF-1.4",
                        filename="efl.pdf",
                        content_type="application/pdf",
                    )

        assert mock_upload.await_args.kwargs["reference_only"] is True
        assert draft.provider_name == "Rhythm"
        # The draft has to cite the row the upload just made, or the saved plan
        # points at nothing and the operator cannot reopen what it was read from.
        assert draft.source_document_id == document_id

    async def test_a_refused_upload_does_not_masquerade_as_an_unreadable_file(
        self,
    ) -> None:
        """``UnreadableDocumentError`` is a ``ValueError``, and the route reads
        the difference: one is 413, the other 422. Conflating them tells someone
        whose file is too big to go and find a different file."""
        with patch.object(
            svc.document_upload_service,
            "accept_upload",
            new=AsyncMock(side_effect=ValueError("File exceeds 10MB limit")),
        ):
            with pytest.raises(ValueError) as excinfo:
                await svc.extract_plan_from_upload(
                    ctx=_upload_ctx(),
                    content=b"%PDF-1.4",
                    filename="efl.pdf",
                    content_type="application/pdf",
                )

        assert not isinstance(excinfo.value, svc.UnreadableDocumentError)
