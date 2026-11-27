"""The research reply → stored idea seam (``app/mappers/savings_idea_mapper``).

Pinned: only URLs the run retrieved survive (fragment / trailing slash /
host case don't matter); an idea with no retrieved source is dropped unless
it is a refinance or utilities idea; amounts are clamped and ordered; an
expired offer, a bad enum or a missing field drops the idea; card details
only for credit cards; one key per subject (a re-found idea keeps one key,
the higher estimate wins within a run); refresh keeps the person's status.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from typing import Any

from app.core.savings_constants import (
    IDEA_KEY_MAX_LENGTH,
    IDEA_MAX_SOURCES,
    IDEA_SAVINGS_MAX_CENTS,
    IDEA_TITLE_MAX_LENGTH,
    IDEAS_PER_RUN_MAX,
)
from app.core.savings_enums import IDEA_STATUS_DISMISSED, IDEA_STATUS_OPEN, IDEA_STATUSES
from app.mappers import savings_idea_mapper
from app.schemas.savings.savings_idea_status_update_request import SavingsIdeaStatusUpdateRequest

_TODAY = _dt.date(2026, 11, 27)
_SOURCE = "https://www.example-bank.com/offers/sapphire"


def _idea(**overrides: Any) -> dict[str, Any]:
    idea: dict[str, Any] = {
        "category": "credit_card",
        "subject": "Chase Sapphire Preferred",
        "title": "Open a Chase Sapphire Preferred for the 60k bonus",
        "savings_low_dollars": 600,
        "savings_high_dollars": 750,
        "effort": "medium",
        "why_it_fits": "You spent $9,200 on dining and travel last year.",
        "steps": ["Check your 5/24 count", "Apply", "Spend $4,000 in 3 months"],
        "source_urls": [_SOURCE],
        "expires_on": None,
        "card_details": {
            "sign_up_bonus": "60,000 points",
            "minimum_spend_dollars": 4000,
            "spend_window_months": 3,
            "annual_fee_dollars": 95,
            "first_year_value_dollars": 655,
            "credit_impact": "One hard inquiry; counts toward 5/24.",
        },
    }
    idea.update(overrides)
    return idea


def _parse(*ideas: dict[str, Any], retrieved: list[str] | None = None) -> list:
    return savings_idea_mapper.parse_reply(
        {"ideas": list(ideas)}, retrieved_urls=retrieved if retrieved is not None else [_SOURCE], today=_TODAY,
    )


class TestSources:
    def test_a_url_the_run_never_retrieved_is_dropped(self) -> None:
        [idea] = _parse(_idea(source_urls=[_SOURCE, "https://made-up.example/page"]))
        assert idea.source_urls == [_SOURCE]

    def test_fragment_trailing_slash_and_host_case_still_match(self) -> None:
        [idea] = _parse(_idea(source_urls=["https://WWW.Example-Bank.com/offers/sapphire/#terms"]))
        assert idea.source_urls == ["https://WWW.Example-Bank.com/offers/sapphire/#terms"]

    def test_an_idea_left_with_no_retrieved_source_is_dropped(self) -> None:
        assert _parse(_idea(source_urls=["https://made-up.example/page"])) == []

    def test_refinance_and_utility_ideas_may_rest_on_the_persons_own_data(self) -> None:
        ideas = _parse(
            _idea(category="mortgage", subject="Elm St loan", source_urls=[], card_details=None),
            _idea(category="utilities", subject="Elm St electricity", source_urls=[], card_details=None),
        )
        assert sorted(idea.category for idea in ideas) == ["mortgage", "utilities"]

    def test_duplicate_sources_collapse_and_are_capped(self) -> None:
        urls = [f"https://site.example/{n}" for n in range(IDEA_MAX_SOURCES + 3)]
        [idea] = _parse(_idea(source_urls=[*urls, urls[0]]), retrieved=urls)
        assert idea.source_urls == urls[:IDEA_MAX_SOURCES]


class TestValues:
    def test_amounts_become_cents_and_low_never_exceeds_high(self) -> None:
        [idea] = _parse(_idea(savings_low_dollars=900, savings_high_dollars=300))
        assert (idea.savings_low_cents, idea.savings_high_cents) == (30_000, 90_000)

    def test_a_negative_or_absurd_amount_is_clamped(self) -> None:
        [idea] = _parse(_idea(savings_low_dollars=-50, savings_high_dollars=10**9))
        assert idea.savings_low_cents == 0
        assert idea.savings_high_cents == IDEA_SAVINGS_MAX_CENTS

    def test_long_text_is_capped(self) -> None:
        [idea] = _parse(_idea(title="x" * 1000))
        assert len(idea.title) == IDEA_TITLE_MAX_LENGTH

    def test_an_expired_offer_is_dropped_and_a_live_one_kept(self) -> None:
        expired = _idea(subject="Old card", expires_on="2026-11-26")
        live = _idea(subject="New card", expires_on="2026-12-31")
        [idea] = _parse(expired, live)
        assert idea.subject == "New card"
        assert idea.expires_on == _dt.date(2026, 12, 31)

    def test_an_unreadable_date_is_treated_as_no_expiry(self) -> None:
        [idea] = _parse(_idea(expires_on="soon"))
        assert idea.expires_on is None

    def test_an_unknown_category_or_effort_or_missing_text_drops_the_idea(self) -> None:
        assert _parse(_idea(category="crypto")) == []
        assert _parse(_idea(effort="trivial")) == []
        assert _parse(_idea(why_it_fits="  ")) == []

    def test_card_details_are_kept_only_for_credit_cards(self) -> None:
        [card] = _parse(_idea())
        assert card.card_details is not None
        assert card.card_details["minimum_spend_dollars"] == 4000
        [bank] = _parse(_idea(category="bank_bonus", subject="SoFi checking"))
        assert bank.card_details is None

    def test_a_reply_without_an_ideas_list_gives_nothing(self) -> None:
        assert savings_idea_mapper.parse_reply({"oops": 1}, retrieved_urls=[_SOURCE], today=_TODAY) == []
        assert savings_idea_mapper.parse_reply(None, retrieved_urls=[_SOURCE], today=_TODAY) == []


class TestKeys:
    def test_the_key_is_category_plus_slugged_subject(self) -> None:
        assert savings_idea_mapper.idea_key("credit_card", "Chase Sapphire Preferred®") == (
            "credit_card:chase-sapphire-preferred"
        )

    def test_the_key_never_exceeds_its_column(self) -> None:
        assert len(savings_idea_mapper.idea_key("property_tax", "z" * 500)) == IDEA_KEY_MAX_LENGTH

    def test_two_ideas_with_one_key_keep_the_bigger_estimate(self) -> None:
        small = _idea(savings_high_dollars=700)
        big = _idea(subject="chase sapphire preferred", savings_high_dollars=900)
        [idea] = _parse(small, big)
        assert idea.savings_high_cents == 90_000

    def test_ideas_come_back_biggest_first_and_capped(self) -> None:
        ideas = [
            _idea(subject=f"Card {n}", savings_low_dollars=n, savings_high_dollars=n)
            for n in range(IDEAS_PER_RUN_MAX + 5)
        ]
        parsed = _parse(*ideas)
        assert len(parsed) == IDEAS_PER_RUN_MAX
        assert parsed[0].savings_high_cents > parsed[-1].savings_high_cents


class TestRows:
    def test_a_new_idea_is_open_and_first_found_now(self) -> None:
        [parsed] = _parse(_idea())
        now = _dt.datetime(2026, 11, 27, 9, tzinfo=_dt.timezone.utc)
        run_id = uuid.uuid4()
        row = savings_idea_mapper.new_idea(
            parsed, organization_id=uuid.uuid4(), user_id=uuid.uuid4(), run_id=run_id, now=now,
        )
        assert row.status == IDEA_STATUS_OPEN
        assert row.first_found_at == now == row.last_confirmed_at
        assert row.last_run_id == run_id

    def test_refreshing_keeps_the_persons_status_and_first_found(self) -> None:
        [parsed] = _parse(_idea())
        first = _dt.datetime(2026, 11, 1, tzinfo=_dt.timezone.utc)
        row = savings_idea_mapper.new_idea(
            parsed, organization_id=uuid.uuid4(), user_id=uuid.uuid4(), run_id=uuid.uuid4(), now=first,
        )
        row.status = IDEA_STATUS_DISMISSED
        later = first + _dt.timedelta(days=3)
        [again] = _parse(_idea(savings_high_dollars=800))
        savings_idea_mapper.refresh_idea(row, again, run_id=uuid.uuid4(), now=later)
        assert row.status == IDEA_STATUS_DISMISSED
        assert row.first_found_at == first
        assert row.last_confirmed_at == later
        assert row.savings_high_cents == 80_000


def test_the_status_request_allows_exactly_the_idea_statuses() -> None:
    allowed = SavingsIdeaStatusUpdateRequest.model_fields["status"].annotation.__args__
    assert tuple(allowed) == IDEA_STATUSES
