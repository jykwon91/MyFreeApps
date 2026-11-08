"""Which observed statuses to store: only changes, plus a periodic checkpoint.

Pure — no I/O — so the rule is unit-tested on its own.
"""
from collections.abc import Mapping, Sequence
from datetime import datetime, timedelta

from app.core.wow_server_status import CHECKPOINT_INTERVAL, STATUS_DOWN, STATUS_UP
from app.schemas.wow.server_status import ServerRuleset
from app.services.wow.server_status.observed_ruleset import ObservedRuleset


def observed_rulesets(rulesets: Sequence[ServerRuleset]) -> list[ObservedRuleset]:
    """Blizzard's ``online`` flags as stored statuses; a repeated slug counts once."""
    observed: list[ObservedRuleset] = []
    seen: set[str] = set()
    for ruleset in rulesets:
        if not ruleset.slug or ruleset.slug in seen:
            continue
        seen.add(ruleset.slug)
        observed.append(ObservedRuleset(slug=ruleset.slug, status=STATUS_UP if ruleset.online else STATUS_DOWN))
    return observed


def rulesets_to_store(
    latest: Mapping[str, tuple[str, datetime]],
    observed: Sequence[ObservedRuleset],
    now: datetime,
    checkpoint_interval: timedelta = CHECKPOINT_INTERVAL,
) -> list[ObservedRuleset]:
    """The observed rulesets that need a new row at ``now``.

    ``latest`` maps a ruleset slug to its newest stored (status, observed_at).
    A row is due when the ruleset has none yet, its status changed, or its
    newest row is ``checkpoint_interval`` old or more.
    """
    due: list[ObservedRuleset] = []
    for ruleset in observed:
        last = latest.get(ruleset.slug)
        if last is None:
            due.append(ruleset)
            continue
        last_status, last_at = last
        if last_status != ruleset.status or now - last_at >= checkpoint_interval:
            due.append(ruleset)
    return due
