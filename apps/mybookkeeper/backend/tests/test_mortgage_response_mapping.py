"""Turning a stored row into the response the API returns.

This seam is the only place ``property_name`` — which lives on the property,
not on the loan — is grafted onto a mortgage. Every read and write path in the
service goes through it.

It gets its own test because ``test_mortgages_api.py`` mocks the service
wholesale, so no other test in the suite ever executes it against a real row.
That gap shipped a ``TypeError`` (``model_validate`` has no ``update``
argument) that made every create, read, list, and update return a 500 in the
browser while the whole backend suite stayed green.
"""
import datetime as _dt
import uuid
from decimal import Decimal

from app.models.mortgage.mortgage import Mortgage
from app.services.mortgage.mortgage_service import _to_response


def _row() -> Mortgage:
    """6734 Peerless as its statement reads, as an unsaved ORM row.

    Timestamps are set by hand because the columns are server-defaulted and
    this row never reaches the database — the response schema requires them.
    """
    now = _dt.datetime(2026, 8, 1, 12, 0, 0, tzinfo=_dt.timezone.utc)
    return Mortgage(
        id=uuid.uuid4(),
        user_id=uuid.uuid4(),
        organization_id=uuid.uuid4(),
        property_id=uuid.uuid4(),
        source_document_id=None,
        lender="TDECU",
        account_number="240224944",
        current_balance_cents=33_613_735,
        statement_date=_dt.date(2026, 8, 1),
        original_principal_cents=None,
        interest_rate=Decimal("7.125"),
        rate_type="fixed",
        fixed_until=None,
        maturity_date=None,
        term_months=None,
        monthly_principal_cents=30_156,
        monthly_interest_cents=199_582,
        monthly_escrow_cents=87_081,
        notes=None,
        created_at=now,
        updated_at=now,
    )


class TestMortgageResponseMapping:
    def test_maps_a_stored_row_without_raising(self):
        row = _row()

        response = _to_response(row, "6734 Peerless")

        assert response.id == row.id
        assert response.property_id == row.property_id
        assert response.lender == "TDECU"
        assert response.rate_type == "fixed"

    def test_grafts_the_property_name_onto_the_row(self):
        # The name is joined in by the service; the loan itself does not carry
        # it. Losing it here is what turns every row in the list into "this
        # property".
        response = _to_response(_row(), "6734 Peerless")

        assert response.property_name == "6734 Peerless"

    def test_leaves_the_name_empty_when_the_property_is_unknown(self):
        response = _to_response(_row(), None)

        assert response.property_name is None

    def test_carries_the_figures_across_unrounded(self):
        # Cents and the rate's trailing digit are the two things a statement is
        # transcribed for; a lossy mapping here is silent.
        response = _to_response(_row(), "6734 Peerless")

        assert response.current_balance_cents == 33_613_735
        assert response.interest_rate == Decimal("7.125")
        assert response.monthly_principal_cents == 30_156
        assert response.monthly_interest_cents == 199_582
        assert response.monthly_escrow_cents == 87_081

    def test_reads_the_encrypted_account_number_as_plaintext(self):
        # ``account_number`` is an ``EncryptedString`` column. The encryption
        # happens at bind time, so the mapper must see — and pass through — the
        # plaintext the caller set.
        response = _to_response(_row(), "6734 Peerless")

        assert response.account_number == "240224944"
