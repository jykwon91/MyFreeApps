"""Research reply → validated ideas → ``SavingsIdea`` rows. Pure; no I/O.

The reply is schema-shaped but not trusted: every string is capped, every
amount clamped, and every source URL must be one the run actually retrieved
(``ResearchResponse.sources``). An idea left with no retrieved source is
dropped, except refinance and utility ideas, which rest on the person's own
data and point into the app instead.
"""
from __future__ import annotations

import datetime as _dt
import logging
import uuid
from collections.abc import Iterable
from typing import Any
from urllib.parse import urlsplit, urlunsplit

from app.core.savings_constants import (
    CARD_TEXT_MAX_LENGTH,
    IDEA_KEY_MAX_LENGTH,
    IDEA_MAX_SOURCES,
    IDEA_MAX_STEPS,
    IDEA_SAVINGS_MAX_CENTS,
    IDEA_SOURCE_URL_MAX_LENGTH,
    IDEA_STEP_MAX_LENGTH,
    IDEA_SUBJECT_MAX_LENGTH,
    IDEA_TITLE_MAX_LENGTH,
    IDEA_WHY_MAX_LENGTH,
    IDEAS_PER_RUN_MAX,
)
from app.core.savings_enums import (
    CATEGORY_CREDIT_CARD,
    CATEGORY_MORTGAGE,
    CATEGORY_UTILITIES,
    IDEA_CATEGORIES,
    IDEA_EFFORTS,
    IDEA_STATUS_OPEN,
)
from app.core.slug_utils import slugify
from app.models.savings.savings_idea import SavingsIdea
from app.services.savings.parsed_savings_idea import ParsedSavingsIdea

logger = logging.getLogger(__name__)

_CENTS_PER_DOLLAR = 100
# Ideas that rest on the person's own data and link into the app, so a
# retrieved web source isn't required.
_SOURCE_OPTIONAL_CATEGORIES = frozenset({CATEGORY_MORTGAGE, CATEGORY_UTILITIES})
_CARD_INT_FIELDS = (
    "minimum_spend_dollars",
    "spend_window_months",
    "annual_fee_dollars",
    "first_year_value_dollars",
)
_CARD_TEXT_FIELDS = ("sign_up_bonus", "credit_impact")
_KEY_SEPARATOR = ":"
_KEY_FALLBACK = "idea"


def idea_key(category: str, subject: str) -> str:
    """The stable key two runs' versions of one idea share."""
    slug_room = IDEA_KEY_MAX_LENGTH - len(category) - len(_KEY_SEPARATOR)
    slug = slugify(subject, max_length=slug_room, fallback=_KEY_FALLBACK)
    return f"{category}{_KEY_SEPARATOR}{slug}"


def normalize_url(url: str) -> str:
    """Compare URLs without their fragment, trailing slash or host case."""
    parts = urlsplit(url.strip())
    path = parts.path.rstrip("/")
    return urlunsplit((parts.scheme.lower(), parts.netloc.lower(), path, parts.query, ""))


def _text(value: Any, limit: int) -> str:
    return value.strip()[:limit] if isinstance(value, str) else ""


def _int(value: Any) -> int | None:
    if isinstance(value, bool) or not isinstance(value, int | float):
        return None
    return int(value)


def _cents(value: Any) -> int:
    dollars = _int(value)
    if dollars is None or dollars < 0:
        return 0
    return min(dollars * _CENTS_PER_DOLLAR, IDEA_SAVINGS_MAX_CENTS)


def _date(value: Any) -> _dt.date | None:
    if not isinstance(value, str):
        return None
    try:
        return _dt.date.fromisoformat(value.strip())
    except ValueError:
        return None


def _steps(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    steps = [_text(step, IDEA_STEP_MAX_LENGTH) for step in value]
    return [step for step in steps if step][:IDEA_MAX_STEPS]


def _sources(value: Any, retrieved: set[str]) -> list[str]:
    if not isinstance(value, list):
        return []
    kept: list[str] = []
    seen: set[str] = set()
    for url in value:
        if not isinstance(url, str) or len(url) > IDEA_SOURCE_URL_MAX_LENGTH:
            continue
        key = normalize_url(url)
        if key in retrieved and key not in seen:
            seen.add(key)
            kept.append(url.strip())
    return kept[:IDEA_MAX_SOURCES]


def _card_details(value: Any) -> dict[str, Any] | None:
    if not isinstance(value, dict):
        return None
    details: dict[str, Any] = {}
    for name in _CARD_INT_FIELDS:
        number = _int(value.get(name))
        details[name] = number if number is not None and number >= 0 else None
    for name in _CARD_TEXT_FIELDS:
        details[name] = _text(value.get(name), CARD_TEXT_MAX_LENGTH) or None
    return details


def _parse_one(raw: Any, retrieved: set[str], today: _dt.date) -> ParsedSavingsIdea | None:
    if not isinstance(raw, dict):
        return None
    category = raw.get("category")
    effort = raw.get("effort")
    subject = _text(raw.get("subject"), IDEA_SUBJECT_MAX_LENGTH)
    title = _text(raw.get("title"), IDEA_TITLE_MAX_LENGTH)
    why = _text(raw.get("why_it_fits"), IDEA_WHY_MAX_LENGTH)
    if category not in IDEA_CATEGORIES or effort not in IDEA_EFFORTS or not (subject and title and why):
        return None
    expires_on = _date(raw.get("expires_on"))
    if expires_on is not None and expires_on < today:
        return None
    sources = _sources(raw.get("source_urls"), retrieved)
    if not sources and category not in _SOURCE_OPTIONAL_CATEGORIES:
        return None
    low = _cents(raw.get("savings_low_dollars"))
    high = _cents(raw.get("savings_high_dollars"))
    low, high = min(low, high), max(low, high)
    is_card = category == CATEGORY_CREDIT_CARD
    return ParsedSavingsIdea(
        idea_key=idea_key(category, subject),
        category=category,
        subject=subject,
        title=title,
        savings_low_cents=low,
        savings_high_cents=high,
        effort=effort,
        why_it_fits=why,
        steps=_steps(raw.get("steps")),
        source_urls=sources,
        expires_on=expires_on,
        card_details=_card_details(raw.get("card_details")) if is_card else None,
    )


def parse_reply(data: Any, *, retrieved_urls: Iterable[str], today: _dt.date) -> list[ParsedSavingsIdea]:
    """The valid, de-duplicated ideas in a research reply, biggest first, at most
    ``IDEAS_PER_RUN_MAX``. Two ideas with one key keep the higher savings ceiling.
    """
    raw_ideas = data.get("ideas") if isinstance(data, dict) else None
    if not isinstance(raw_ideas, list):
        return []
    retrieved = {normalize_url(url) for url in retrieved_urls}
    by_key: dict[str, ParsedSavingsIdea] = {}
    dropped = 0
    for raw in raw_ideas:
        parsed = _parse_one(raw, retrieved, today)
        if parsed is None:
            dropped += 1
            continue
        current = by_key.get(parsed.idea_key)
        if current is None or parsed.savings_high_cents > current.savings_high_cents:
            by_key[parsed.idea_key] = parsed
    if dropped:
        logger.info("Savings research: dropped %d of %d ideas in the reply", dropped, len(raw_ideas))
    ranked = sorted(by_key.values(), key=lambda idea: idea.savings_high_cents, reverse=True)
    return ranked[:IDEAS_PER_RUN_MAX]


def new_idea(
    parsed: ParsedSavingsIdea,
    *,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    run_id: uuid.UUID,
    now: _dt.datetime,
) -> SavingsIdea:
    idea = SavingsIdea(
        organization_id=organization_id,
        user_id=user_id,
        idea_key=parsed.idea_key,
        status=IDEA_STATUS_OPEN,
        first_found_at=now,
    )
    refresh_idea(idea, parsed, run_id=run_id, now=now)
    return idea


def refresh_idea(idea: SavingsIdea, parsed: ParsedSavingsIdea, *, run_id: uuid.UUID, now: _dt.datetime) -> None:
    """Take the latest run's figures and mark the idea re-confirmed. Status is untouched."""
    idea.category = parsed.category
    idea.subject = parsed.subject
    idea.title = parsed.title
    idea.savings_low_cents = parsed.savings_low_cents
    idea.savings_high_cents = parsed.savings_high_cents
    idea.effort = parsed.effort
    idea.why_it_fits = parsed.why_it_fits
    idea.steps = list(parsed.steps)
    idea.source_urls = list(parsed.source_urls)
    idea.expires_on = parsed.expires_on
    idea.card_details = parsed.card_details
    idea.last_run_id = run_id
    idea.last_confirmed_at = now
