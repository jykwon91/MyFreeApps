"""Log lines name records by id or domain, never by a person's address, name or document text.

INFO lines become Sentry breadcrumbs and WARNING lines Sentry events, so whatever a
log line carries leaves the server.
"""
import logging
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.classification import rule_engine, rule_learning_service
from app.services.demo import demo_email_service
from app.services.leases.template_placeholder_extractor import _coerce_suggestion
from app.services.organization import invite_email
from app.services.tax.tax_advisor_response_parser import parse_advisor_response
from app.workers import upload_processor_worker

_EMAIL = "jane.doe@example.com"


@pytest.mark.parametrize("sent", [True, False])
async def test_org_invite_email_log_has_only_the_domain(caplog: pytest.LogCaptureFixture, sent: bool) -> None:
    with (
        patch.object(invite_email.email_service, "send_email", AsyncMock(return_value=sent)),
        caplog.at_level(logging.INFO, logger=invite_email.__name__),
    ):
        await invite_email.send_invite_email(
            recipient_email=_EMAIL, org_name=f"{_EMAIL}'s Workspace",
            org_role="viewer", inviter_name="Owner", invite_token="tok",
        )
    assert "jane.doe" not in caplog.text
    assert "***@example.com" in caplog.text


@pytest.mark.parametrize("sent", [True, False])
async def test_demo_invite_log_has_only_the_domain(caplog: pytest.LogCaptureFixture, sent: bool) -> None:
    with (
        patch.object(demo_email_service.email_service, "send_email", AsyncMock(return_value=sent)),
        caplog.at_level(logging.INFO, logger=demo_email_service.__name__),
    ):
        await demo_email_service.send_demo_invite(
            recipient_email=_EMAIL, display_name="Jane", login_email="demo-jane@demo.example.com",
            password="pw", app_url="https://app.example.com",
        )
    assert "jane.doe" not in caplog.text and "demo-jane" not in caplog.text
    assert "***@example.com" in caplog.text


@pytest.mark.parametrize(
    ("kwargs", "kind"),
    [
        ({"vendor": "Jane Doe Plumbing", "address": "12 Elm St"}, "vendor+address"),
        ({"vendor": None, "email_sender": _EMAIL}, "sender"),
        ({"vendor": None, "filename": "Jane Doe W-2.pdf"}, "filename"),
    ],
)
async def test_rule_match_log_names_the_rule(
    caplog: pytest.LogCaptureFixture, kwargs: dict[str, str | None], kind: str,
) -> None:
    rule = MagicMock(id=uuid.uuid4(), category="repairs", property_id=None, activity_id=None)
    with (
        patch.object(rule_engine.classification_rule_repo, "get_matching_rule", AsyncMock(return_value=rule)),
        patch.object(rule_engine.classification_rule_repo, "increment_applied", AsyncMock()),
        caplog.at_level(logging.INFO, logger=rule_engine.__name__),
    ):
        await rule_engine.classify(MagicMock(), uuid.uuid4(), current_category="uncategorized", **kwargs)
    assert f"rule_id={rule.id} kind={kind}" in caplog.text
    for value in ("Jane", "jane", "Elm"):
        assert value not in caplog.text


def test_unparseable_tax_advice_is_logged_without_its_text(caplog: pytest.LogCaptureFixture) -> None:
    raw = '{"suggestions": [{"title": "Jane Doe owes $4,812 on 12 Elm St"'
    with caplog.at_level(logging.ERROR):
        parse_advisor_response(raw)
    assert "Jane Doe" not in caplog.text and "4,812" not in caplog.text
    assert f"chars={len(raw)} stop_reason=unknown sha256=" in caplog.text


def test_invalid_tax_suggestion_is_logged_by_index(caplog: pytest.LogCaptureFixture) -> None:
    raw = '{"suggestions": [{"title": "Jane Doe owes $4,812 on 12 Elm St"}]}'
    with caplog.at_level(logging.WARNING):
        assert parse_advisor_response(raw).suggestions == []
    assert "Jane Doe" not in caplog.text
    assert "invalid suggestion at index 0 (ValidationError)" in caplog.text


def test_malformed_placeholder_suggestion_is_logged_by_type(caplog: pytest.LogCaptureFixture) -> None:
    raw = MagicMock()
    raw.get.side_effect = RuntimeError("bad")
    raw.__repr__ = lambda _self: "TENANT_NAME=Jane Doe"
    with caplog.at_level(logging.WARNING):
        assert _coerce_suggestion(raw) is None
    assert "Jane Doe" not in caplog.text
    assert "type=MagicMock" in caplog.text


async def test_document_processing_log_names_the_document_not_its_file(caplog: pytest.LogCaptureFixture) -> None:
    doc = MagicMock(id=uuid.uuid4(), organization_id=uuid.uuid4(), retry_count=0, file_name="Jane Doe W-2.pdf")
    session = MagicMock()
    session.__aenter__ = AsyncMock(return_value=MagicMock())
    session.__aexit__ = AsyncMock(return_value=False)
    with (
        patch.object(upload_processor_worker, "AsyncSessionLocal", MagicMock(return_value=session)),
        patch.object(upload_processor_worker.document_repo, "claim_next_processing", AsyncMock(return_value=doc)),
        patch.object(upload_processor_worker, "process_document", AsyncMock(return_value=MagicMock(discarded=True))),
        caplog.at_level(logging.INFO, logger=upload_processor_worker.__name__),
    ):
        assert await upload_processor_worker.process_one_for_user(uuid.uuid4()) is True
    assert f"Processing document {doc.id}" in caplog.text
    assert "Jane Doe" not in caplog.text


async def test_learned_property_rule_log_names_the_transaction(caplog: pytest.LogCaptureFixture) -> None:
    txn = MagicMock(id=uuid.uuid4(), vendor="Jane Doe Plumbing", address="12 Elm St", property_id=uuid.uuid4())
    with (
        patch.object(rule_learning_service.classification_rule_repo, "upsert_rule", AsyncMock()),
        patch.object(rule_learning_service, "_retroactive_property_fix", AsyncMock(return_value=2)),
        patch.object(rule_learning_service, "record_event", AsyncMock()),
        caplog.at_level(logging.INFO, logger=rule_learning_service.__name__),
    ):
        await rule_learning_service.learn_from_property_correction(MagicMock(), uuid.uuid4(), uuid.uuid4(), txn)
    assert f"Property rule learned from transaction {txn.id}" in caplog.text
    assert "Jane" not in caplog.text and "Elm" not in caplog.text
