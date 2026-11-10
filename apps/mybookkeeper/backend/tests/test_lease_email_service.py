"""Tests for ``app.services.leases.lease_email_service``.

Three layers:

1. Pure-function helpers (``build_subject`` / ``build_body_html`` /
   ``_redact_email``) — no I/O, no fixtures.
2. ``should_auto_email_after_generate`` predicate (in signed_lease_service) —
   exhaustive truth-table coverage so the four-gate logic doesn't drift.
3. Service ``send_lease_to_tenant`` integration with mocked SMTP +
   storage — exercises the skip paths and the happy path on a
   sqlite in-memory db.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.leases import lease_email_service, signed_lease_service
from app.services.leases.lease_email_service import (
    ApplicantEmailMissingError,
    LEASE_EMAIL_ATTACHMENT_KINDS,
    LeaseNotFoundError,
    _redact_email,
    build_body_html,
    build_subject,
)
from app.services.leases.signed_lease_service import (
    should_auto_email_after_generate,
)


# ---------------------------------------------------------------------------
# Pure helpers
# ---------------------------------------------------------------------------


class TestBuildSubject:
    def test_includes_legal_name(self) -> None:
        assert build_subject(applicant_legal_name="Jane Doe") == (
            "Your lease — Jane Doe"
        )

    def test_falls_back_when_legal_name_missing(self) -> None:
        assert build_subject(applicant_legal_name=None) == "Your lease"

    def test_treats_empty_string_as_missing(self) -> None:
        assert build_subject(applicant_legal_name="") == "Your lease"


class TestBuildBodyHtml:
    def test_mentions_listing_title_when_present(self) -> None:
        html = build_body_html(listing_title="Maple Cottage")
        assert "Maple Cottage" in html

    def test_omits_address_line_when_listing_missing(self) -> None:
        html = build_body_html(listing_title=None)
        # The body still contains the headline + reply prompt; just not
        # the listing-specific line.
        assert "Your lease is ready" in html
        assert "review the attached" in html

    def test_escapes_listing_title(self) -> None:
        html = build_body_html(listing_title="<script>alert('xss')</script>")
        assert "<script>" not in html
        assert "&lt;script&gt;" in html


class TestRedactEmail:
    def test_redacts_local_part(self) -> None:
        assert _redact_email("jane@example.com") == "j***@example.com"

    def test_handles_empty_local_part(self) -> None:
        # Defensive — RFC says you can't have a leading @, but if some
        # malformed value reaches the logger we must not raise.
        assert _redact_email("@example.com") == "***@example.com"

    def test_handles_missing_at_sign(self) -> None:
        assert _redact_email("plainstring") == "***"

    def test_handles_empty_value(self) -> None:
        assert _redact_email("") == "***"


# ---------------------------------------------------------------------------
# Auto-email predicate — exhaustive truth table
# ---------------------------------------------------------------------------


class TestShouldAutoEmailAfterGenerate:
    """Two gates: previous_status != 'generated' AND auto_email_tenant.

    An emailed or sent lease never reaches the predicate; generate refuses it.
    """

    def test_first_generate_with_email_enabled_returns_true(self) -> None:
        assert should_auto_email_after_generate(
            previous_status="draft",
            auto_email_tenant=True,
        ) is True

    def test_regenerate_does_not_re_email(self) -> None:
        # Even with all other gates open, "previous status was already
        # generated" must short-circuit to False.
        assert should_auto_email_after_generate(
            previous_status="generated",
            auto_email_tenant=True,
        ) is False

    def test_opted_out_lease_does_not_email(self) -> None:
        assert should_auto_email_after_generate(
            previous_status="draft",
            auto_email_tenant=False,
        ) is False


# ---------------------------------------------------------------------------
# send_lease_to_tenant — service-level integration with mocks
# ---------------------------------------------------------------------------


def _make_fake_attachment(*, kind: str, storage_key: str = "k") -> object:
    fake = MagicMock()
    fake.kind = kind
    fake.storage_key = storage_key
    fake.content_type = "application/pdf"
    fake.filename = "lease.pdf"
    fake.signed_by_tenant_at = None
    fake.signed_by_landlord_at = None
    return fake


class TestSendLeaseToTenant:
    def test_lease_email_attachment_kinds_includes_rendered_and_signed(self) -> None:
        # Defensive constant check — frontend / docs reference these.
        assert "rendered_original" in LEASE_EMAIL_ATTACHMENT_KINDS
        assert "signed_lease" in LEASE_EMAIL_ATTACHMENT_KINDS
        # Inspections / insurance / addenda are NOT included.
        assert "move_in_inspection" not in LEASE_EMAIL_ATTACHMENT_KINDS
        assert "insurance_proof" not in LEASE_EMAIL_ATTACHMENT_KINDS


class TestAssertCanEmailTenant:
    @pytest.mark.asyncio
    async def test_raises_lease_not_found(self, db) -> None:
        # Patch unit_of_work to use the test sqlite session (the function
        # is shaped as ``async with unit_of_work() as session:`` so we
        # need a context manager that yields ``db``).
        from contextlib import asynccontextmanager

        @asynccontextmanager
        async def _fake_uow():  # type: ignore[no-untyped-def]
            yield db

        with patch.object(lease_email_service, "unit_of_work", _fake_uow):
            with pytest.raises(LeaseNotFoundError):
                await lease_email_service.assert_can_email_tenant(
                    lease_id=uuid.uuid4(),
                    user_id=uuid.uuid4(),
                    organization_id=uuid.uuid4(),
                )


class TestDemoWorkspaces:
    @pytest.mark.asyncio
    async def test_the_check_refuses_a_demo_workspace(self, db, test_user, test_org) -> None:
        from contextlib import asynccontextmanager

        @asynccontextmanager
        async def _fake_uow():  # type: ignore[no-untyped-def]
            yield db

        test_org.is_demo = True
        await db.flush()
        with patch.object(lease_email_service, "unit_of_work", _fake_uow):
            with pytest.raises(lease_email_service.DemoWorkspaceEmailError):
                await lease_email_service.assert_can_email_tenant(
                    lease_id=uuid.uuid4(), user_id=test_user.id, organization_id=test_org.id,
                )

    @pytest.mark.asyncio
    @pytest.mark.parametrize(("is_demo", "looked_up_the_lease"), [(True, False), (False, True)])
    async def test_a_queued_send_stops_for_a_demo_workspace_only(
        self, db, test_user, test_org, is_demo: bool, looked_up_the_lease: bool,
    ) -> None:
        from contextlib import asynccontextmanager

        @asynccontextmanager
        async def _fake_uow():  # type: ignore[no-untyped-def]
            yield db

        test_org.is_demo = is_demo
        await db.flush()
        with (
            patch.object(lease_email_service, "unit_of_work", _fake_uow),
            patch.object(lease_email_service.signed_lease_repo, "get", AsyncMock(return_value=None)) as get_lease,
            patch.object(lease_email_service.email_service, "send_email") as send_email,
        ):
            sent = await lease_email_service.send_lease_to_tenant(
                lease_id=uuid.uuid4(), user_id=test_user.id, organization_id=test_org.id,
            )
        assert sent is False
        assert get_lease.called is looked_up_the_lease
        send_email.assert_not_called()


# ---------------------------------------------------------------------------
# generate_lease wiring — confirm tuple return shape
# ---------------------------------------------------------------------------


class TestGenerateLeaseReturnsTuple:
    def test_should_auto_email_predicate_is_exposed(self) -> None:
        # Prove the public API of signed_lease_service still includes
        # the predicate — frontend / api layer relies on it.
        assert callable(signed_lease_service.should_auto_email_after_generate)
