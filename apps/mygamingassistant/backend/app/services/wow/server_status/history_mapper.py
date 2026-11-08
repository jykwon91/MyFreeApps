"""Stored server status rows → the history response. Pure."""
from collections.abc import Mapping, Sequence
from datetime import datetime

from app.core.wow_server_status import MAX_SAMPLE_GAP, RECORD_INTERVAL, RULESET_NAMES, RULESET_ORDER
from app.models.wow.server_status_sample import WowServerStatusSample
from app.repositories.wow.status_streak import StatusStreak
from app.schemas.wow.ruleset_history import RulesetHistory
from app.schemas.wow.server_status_history import ServerStatusHistoryResponse
from app.schemas.wow.server_status_point import ServerStatusPoint


def ruleset_name(slug: str) -> str:
    """Display name for a ruleset slug; a ruleset Blizzard adds later gets a readable fallback."""
    return RULESET_NAMES.get(slug) or slug.replace("-", " ").title()


def _sort_key(slug: str) -> tuple[int, str]:
    return (RULESET_ORDER.index(slug), "") if slug in RULESET_ORDER else (len(RULESET_ORDER), slug)


def to_history_response(
    region: str,
    *,
    generated_at: datetime,
    window_start: datetime,
    opening: Sequence[WowServerStatusSample],
    in_window: Sequence[WowServerStatusSample],
    streaks: Mapping[str, StatusStreak],
) -> ServerStatusHistoryResponse:
    """``opening`` is each ruleset's newest row before the window; ``in_window`` the rows inside it."""
    points: dict[str, list[ServerStatusPoint]] = {}
    for row in [*opening, *in_window]:
        points.setdefault(row.ruleset, []).append(ServerStatusPoint(at=row.observed_at, status=row.status))
    slugs = sorted(set(points) | set(streaks), key=_sort_key)
    rulesets = [
        RulesetHistory(
            slug=slug,
            name=ruleset_name(slug),
            since=streaks[slug].since if slug in streaks else None,
            since_exact=streaks[slug].exact if slug in streaks else False,
            points=sorted(points.get(slug, []), key=lambda p: p.at),
        )
        for slug in slugs
    ]
    return ServerStatusHistoryResponse(
        region=region,
        generated_at=generated_at,
        window_start=window_start,
        check_interval_seconds=int(RECORD_INTERVAL.total_seconds()),
        max_gap_seconds=int(MAX_SAMPLE_GAP.total_seconds()),
        rulesets=rulesets,
    )
