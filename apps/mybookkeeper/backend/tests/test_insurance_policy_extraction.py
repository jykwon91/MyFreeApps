"""Tests for reading an insurance policy out of a document.

The model's output is untrusted input. These tests are mostly about what
happens when it is wrong — a premium with no billing period, a percentage
returned as a fraction, a hallucinated frequency, a bare list instead of an
object — because the failure mode that matters is not "extraction failed"
(visible) but "extraction produced a plausible wrong number" (invisible, and it
ends up driving an are-you-overpaying badge).
"""
from __future__ import annotations

import datetime as _dt
import uuid
from decimal import Decimal
from unittest.mock import AsyncMock, patch

import pytest

from app.core.context import RequestContext
from app.models.organization.organization_member import OrgRole
from app.services.insurance import insurance_policy_extraction_service as svc

DOC_ID = uuid.uuid4()


def _draft(**raw):
    return svc.build_draft(raw, document_id=DOC_ID)


def _upload_ctx() -> RequestContext:
    return RequestContext(
        organization_id=uuid.uuid4(), user_id=uuid.uuid4(), org_role=OrgRole.OWNER,
    )


class TestBuildDraftReadsWhatIsThere:
    def test_a_full_dec_page_reading_round_trips(self) -> None:
        draft = _draft(
            policy_name="Landlord Protection — 6734 Peerless St",
            carrier="Texas Mutual",
            policy_number="TXM-4471902",
            effective_date="2026-03-01",
            expiration_date="2027-03-01",
            coverage_amount_cents=40_000_000,
            premium_cents=240_000,
            premium_frequency="annual",
            deductible_cents=100_000,
            wind_hail_deductible_pct="2.00",
            confidence="high",
        )

        assert draft.carrier == "Texas Mutual"
        assert draft.coverage_amount_cents == 40_000_000
        assert draft.premium_cents == 240_000
        assert draft.premium_frequency == "annual"
        assert draft.wind_hail_deductible_pct == Decimal("2.00")
        assert draft.expiration_date == _dt.date(2027, 3, 1)
        assert draft.confidence == "high"
        assert draft.warnings == []
        assert draft.source_document_id == DOC_ID

    def test_a_stated_zero_deductible_survives_as_zero(self) -> None:
        """First-dollar coverage is a real product, not an unrecorded field."""
        draft = _draft(deductible_cents=0)

        assert draft.deductible_cents == 0

    def test_an_empty_reading_is_an_empty_draft_not_an_error(self) -> None:
        draft = _draft()

        assert draft.policy_name is None
        assert draft.premium_cents is None
        assert draft.confidence == "low"
        assert draft.unrepresented == []

    def test_terms_with_no_column_are_carried_rather_than_dropped(self) -> None:
        """A dec page states a dozen limits and this schema holds one of them."""
        draft = _draft(
            unrepresented=[
                "personal liability limit $300,000",
                "loss of use / fair rental value $24,000",
            ],
        )

        assert len(draft.unrepresented) == 2


class TestBuildDraftRefusesTheUnusable:
    def test_a_zero_premium_is_a_failed_read_not_a_free_policy(self) -> None:
        # The row rejects a zero premium outright, so recording one would make
        # a draft that cannot be saved and does not say why.
        draft = _draft(premium_cents=0, premium_frequency="annual")

        assert draft.premium_cents is None

    def test_a_hallucinated_frequency_is_dropped(self) -> None:
        # "yearly" is not one of the four the column accepts. Pre-selecting it
        # would make the operator notice a wrong value rather than pick one.
        draft = _draft(premium_cents=240_000, premium_frequency="yearly")

        assert draft.premium_frequency is None

    def test_a_negative_coverage_amount_is_dropped(self) -> None:
        draft = _draft(coverage_amount_cents=-40_000_000)

        assert draft.coverage_amount_cents is None

    def test_a_wind_hail_percentage_over_100_is_dropped(self) -> None:
        # The column allows 0 < pct <= 100; 200 would fail at INSERT time.
        draft = _draft(wind_hail_deductible_pct="200.00")

        assert draft.wind_hail_deductible_pct is None

    def test_a_zero_wind_hail_percentage_is_dropped(self) -> None:
        """A 0% wind deductible is not a product — the column rejects it."""
        draft = _draft(wind_hail_deductible_pct="0")

        assert draft.wind_hail_deductible_pct is None

    def test_a_wind_hail_percentage_is_quantized_to_two_places(self) -> None:
        draft = _draft(wind_hail_deductible_pct="1.5")

        assert draft.wind_hail_deductible_pct == Decimal("1.50")

    def test_an_unparseable_date_costs_only_that_field(self) -> None:
        """One bad field must not cost the operator the eight good ones."""
        draft = _draft(
            policy_name="Dwelling Fire DP-3",
            carrier="Foremost",
            expiration_date="next March",
        )

        assert draft.expiration_date is None
        assert draft.policy_name == "Dwelling Fire DP-3"
        assert draft.carrier == "Foremost"

    def test_a_non_string_unrepresented_entry_is_dropped(self) -> None:
        draft = _draft(unrepresented=["liability $300,000", 42, None])

        assert draft.unrepresented == ["liability $300,000"]


class TestBuildDraftWarnings:
    def test_a_premium_with_no_period_is_flagged(self) -> None:
        """$200 a month and $200 a year differ by 12x and look identical here."""
        draft = _draft(premium_cents=20_000)

        assert any("how often" in w for w in draft.warnings)

    def test_a_period_with_no_premium_is_flagged(self) -> None:
        draft = _draft(premium_frequency="monthly")

        assert any("the amount" in w for w in draft.warnings)

    def test_a_complete_premium_pair_is_not_flagged(self) -> None:
        draft = _draft(
            premium_cents=240_000,
            premium_frequency="annual",
            coverage_amount_cents=40_000_000,
        )

        assert draft.warnings == []

    def test_a_premium_with_no_coverage_amount_is_flagged_as_uncomparable(
        self,
    ) -> None:
        """Without the dwelling limit the overpaying check silently skips it.

        The policy saves fine and then quietly never appears in the comparison,
        which reads as "priced fine" rather than "not checked".
        """
        draft = _draft(premium_cents=240_000, premium_frequency="annual")

        assert any("market premium" in w for w in draft.warnings)

    def test_an_expiration_on_or_before_the_effective_date_is_flagged(self) -> None:
        draft = _draft(effective_date="2027-03-01", expiration_date="2026-03-01")

        assert any("expiration date" in w for w in draft.warnings)

    def test_a_wind_hail_percentage_with_no_coverage_amount_is_flagged(self) -> None:
        """A percentage of an unknown number is not a deductible anyone can act on."""
        draft = _draft(wind_hail_deductible_pct="2.00")

        assert any("percentage of dwelling coverage" in w for w in draft.warnings)

    def test_fees_with_no_premium_are_flagged(self) -> None:
        """On their own they read as the cost of the policy, which is never true."""
        draft = _draft(fees_and_taxes_cents=39_417)

        assert any("Fees on their own" in w for w in draft.warnings)


class TestBuildDraftKeepsFeesApartFromThePremium:
    """The real 6732 Peerless renewal: $2,591.00 premium, $394.17 of paperwork.

    Read as one number these become $2,985.17 of "premium", which is then
    measured against a county average premium and reports a fairly priced
    policy as 15% over market.
    """

    def test_both_halves_survive_the_read(self) -> None:
        draft = _draft(
            premium_cents=259_100,
            premium_frequency="annual",
            fees_and_taxes_cents=39_417,
            coverage_amount_cents=33_120_000,
        )

        assert draft.premium_cents == 259_100
        assert draft.fees_and_taxes_cents == 39_417
        assert draft.warnings == []

    def test_a_document_stating_no_fees_reports_none_rather_than_zero(self) -> None:
        """Nothing invents a split the document did not state."""
        draft = _draft(
            premium_cents=259_100,
            premium_frequency="annual",
            coverage_amount_cents=33_120_000,
        )

        assert draft.fees_and_taxes_cents is None

    def test_zero_fees_is_kept_because_admitted_carriers_charge_none(self) -> None:
        """Unlike a zero premium, which is a failed read rather than a product."""
        draft = _draft(
            premium_cents=259_100,
            premium_frequency="annual",
            fees_and_taxes_cents=0,
            coverage_amount_cents=33_120_000,
        )

        assert draft.fees_and_taxes_cents == 0

    def test_negative_fees_are_dropped(self) -> None:
        """A negative fee is a misread; the column would refuse it anyway."""
        draft = _draft(fees_and_taxes_cents=-100)

        assert draft.fees_and_taxes_cents is None


@pytest.mark.asyncio
class TestExtractPolicyFromDocument:
    async def test_a_document_from_another_org_is_not_found(self) -> None:
        with patch.object(
            svc, "load_document", side_effect=svc.DocumentNotFoundError(str(DOC_ID)),
        ):
            with pytest.raises(svc.DocumentNotFoundError):
                await svc.extract_policy_from_document(
                    user_id=uuid.uuid4(),
                    organization_id=uuid.uuid4(),
                    document_id=DOC_ID,
                )

    async def test_a_non_dict_response_degrades_to_an_empty_draft(self) -> None:
        """The model ignoring the contract must not 500 the request."""
        with patch.object(
            svc, "load_document", new=AsyncMock(return_value=(b"x", "pdf", "")),
        ):
            with patch.object(
                svc, "extract_raw", new=AsyncMock(return_value=["not", "an", "object"]),
            ):
                draft = await svc.extract_policy_from_document(
                    user_id=uuid.uuid4(),
                    organization_id=uuid.uuid4(),
                    document_id=DOC_ID,
                )

        assert draft.carrier is None
        assert draft.confidence == "low"
        assert draft.source_document_id == DOC_ID


@pytest.mark.asyncio
class TestExtractPolicyFromUpload:
    """Bytes in, draft out — the path a phone takes with no library to point at."""

    async def test_the_file_is_stored_as_reference_material(self) -> None:
        """Stored any other way, the transaction extractor invents an expense.

        A declarations page has an annual premium printed on it, which the
        transaction pipeline would happily book as a payment that never
        happened.
        """
        document_id = uuid.uuid4()
        with patch.object(
            svc.document_upload_service,
            "accept_upload",
            new=AsyncMock(return_value={"document_id": str(document_id)}),
        ) as mock_upload:
            with patch.object(
                svc, "load_document", new=AsyncMock(return_value=(b"x", "pdf", "")),
            ):
                with patch.object(
                    svc,
                    "extract_raw",
                    new=AsyncMock(return_value={"carrier": "Foremost"}),
                ):
                    draft = await svc.extract_policy_from_upload(
                        ctx=_upload_ctx(),
                        content=b"%PDF-1.4",
                        filename="dec-page.pdf",
                        content_type="application/pdf",
                    )

        assert mock_upload.await_args.kwargs["reference_only"] is True
        assert draft.carrier == "Foremost"
        # The draft has to cite the row the upload just made, or the saved
        # policy points at nothing and the operator cannot reopen the page its
        # numbers came from.
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
                await svc.extract_policy_from_upload(
                    ctx=_upload_ctx(),
                    content=b"%PDF-1.4",
                    filename="dec-page.pdf",
                    content_type="application/pdf",
                )

        assert not isinstance(excinfo.value, svc.UnreadableDocumentError)
