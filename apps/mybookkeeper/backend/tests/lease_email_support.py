"""Patches for driving the lease tenant email against the test database."""
from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

EMAIL = "app.services.leases.lease_email_service"
APPLICANT = SimpleNamespace(legal_name="Jane Doe", contact_email="jane@example.com")


def _applicants(applicant: SimpleNamespace) -> MagicMock:
    """Only the email service sees this; the shared repo module is left alone."""
    return MagicMock(get=AsyncMock(return_value=applicant))


def email_patches(storage: MagicMock, send, applicant: SimpleNamespace = APPLICANT):
    return (
        patch(f"{EMAIL}.get_storage", return_value=storage),
        patch(f"{EMAIL}.applicant_repo", _applicants(applicant)),
        patch(f"{EMAIL}.demo_repo", MagicMock(is_demo_org=AsyncMock(return_value=False))),
        patch(f"{EMAIL}.email_service.send_email", send),
        patch(f"{EMAIL}.email_service.is_configured", return_value=True),
        patch(f"{EMAIL}.record_event", AsyncMock()),
    )
