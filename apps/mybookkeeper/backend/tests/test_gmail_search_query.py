"""Tests for ``settings.gmail_search_query`` — the Gmail discovery filter.

Anything that doesn't match this query at API-list time is never fetched, so
the query defines the full universe of mail MBK can react to. Utility "bill is
ready / bill is due" notifications (City of Houston Water, AT&T, Constellation,
CenterPoint) carry the amount in the email BODY rather than an attachment or a
statement-subject, so none of the document-extractor clauses matched them and
the bills were silently never discovered. These tests pin the targeted
utility-notification clauses (and guard the pre-existing clauses against
accidental removal) so a future edit can't regress discovery.

The extraction side that turns a discovered bill into a transaction is covered
by ``test_utility_bill_silent_drop.py`` / ``test_claude_service_prompt.py``;
this file is purely about discovery.
"""
from app.core.config import settings


class TestUtilityBillSubjectClauses:
    """The bill-ready / bill-due subject phrases must be in the query."""

    def test_bill_ready_phrases_present(self) -> None:
        query = settings.gmail_search_query
        for phrase in (
            'subject:"bill is ready"',
            'subject:"bill is due"',
            'subject:"bill is now"',
            'subject:"bill is available"',
            'subject:"water bill"',
        ):
            assert phrase in query, f"missing utility subject clause: {phrase}"

    def test_no_bare_subject_bill_clause(self) -> None:
        """A bare ``subject:bill`` would be far too noisy (matches "billing
        address", marketing, etc.) — the utility clauses must stay scoped to
        quoted bill-ready phrases. ``subject:billing`` (no trailing space)
        is the pre-existing document-extractor clause and is allowed."""
        assert "subject:bill " not in settings.gmail_search_query


class TestUtilityBillSenderClauses:
    """The known utility notification sender domains must be in the query."""

    def test_utility_sender_domains_present(self) -> None:
        query = settings.gmail_search_query
        for sender in (
            "from:houstontx.gov",
            "from:emailff.att-mail.com",
            "from:emaildl.att-mail.com",
            "from:tmr3.com",
            "from:constellation.com",
        ):
            assert sender in query, f"missing utility sender clause: {sender}"


class TestExistingClausesPreserved:
    """The change is additive — pre-existing clauses must not be dropped."""

    def test_document_extractor_clauses_preserved(self) -> None:
        query = settings.gmail_search_query
        for clause in ("subject:invoice", "subject:statement", "has:attachment"):
            assert clause in query, f"regressed document-extractor clause: {clause}"

    def test_p2p_payment_clauses_preserved(self) -> None:
        query = settings.gmail_search_query
        for clause in (
            "from:zellepay.com",
            "from:venmo.com",
            '"received money with zelle"',
        ):
            assert clause in query, f"regressed P2P clause: {clause}"
