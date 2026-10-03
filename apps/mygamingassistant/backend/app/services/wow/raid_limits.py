"""Role and class limits — pure, no DB access.

A raid may cap how many players come as each role (``role_limits``: tank,
melee, ranged, healer) and in each class column (``class_limits``: the
nine classes).  Tanks are capped only as a role: the Tank column holds
every tank spec, whatever the class, so a class limit never counts or
refuses one.

What a limit counts
-------------------
The players in line — seat holders and the queue, the players the post's
columns list — so the queue moving up never breaks a limit.  Tentative,
bench and absence are never counted, and never refused.

What a limit refuses
--------------------
A change that moves a player *into* a column or role already holding its
limit, the player not counted.  Someone already in it may switch spec
inside it, or between confirmed and late, whatever the limit is now: a
leader may lower a limit below the count, and nobody is removed.  When a
class and a role both refuse, the class is the reason given.
"""
from __future__ import annotations

from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from typing import Final, Literal

from app.models.wow.wow_raid_event import WowRaidEvent
from app.models.wow.wow_raid_signup import WowRaidSignup
from app.services.wow.raid_catalog import CLASSES, TANK_COLUMN, WowSpecInfo, column_specs, effective_spec
from app.services.wow.raid_composition import RoleGaps, role_gaps
from app.services.wow.raid_post_layout import ROLE_ROW, column_counts, column_of, role_counts
from app.services.wow.raid_roster import LINE_STATUSES, LISTED_STATUSES, RoleCounts

LIMIT_MAX: Final = 40
# Role-row order, then the post's class order.
LIMIT_ROLES: Final = tuple(role for role, _, _ in ROLE_ROW)
LIMIT_CLASSES: Final = tuple(cls.key for cls in CLASSES)

LimitKind = Literal["class", "role"]


@dataclass(frozen=True)
class Limits:
    """A raid's limits, role → most players and class → most players; a missing key = no limit."""

    roles: Mapping[str, int]
    classes: Mapping[str, int]

    @classmethod
    def of(cls, event: WowRaidEvent) -> Limits:
        return cls(
            roles=clean_limits(event.role_limits, LIMIT_ROLES),
            classes=clean_limits(event.class_limits, LIMIT_CLASSES),
        )

    def for_column(self, column: str) -> int | None:
        """The limit a post button shows: Max tanks on [Tank], else the class's."""
        if column == TANK_COLUMN:
            return self.roles.get("tank")
        return self.classes.get(column)


@dataclass(frozen=True)
class LimitHit:
    """A limit refusing a change: *count* players already in line for it, the player asking not counted."""

    kind: LimitKind
    key: str  # the class, or the role
    count: int
    limit: int


def clean_limits(raw: object, keys: Sequence[str]) -> dict[str, int]:
    """Stored JSON → {key: limit} in *keys* order; unknown keys and anything but 0–40 dropped."""
    if not isinstance(raw, Mapping):
        return {}
    limits: dict[str, int] = {}
    for key in keys:
        value = raw.get(key)
        if isinstance(value, int) and not isinstance(value, bool) and 0 <= value <= LIMIT_MAX:
            limits[key] = value
    return limits


def limit_hit(
    signups: Sequence[WowRaidSignup],
    *,
    discord_user_id: str,
    spec: WowSpecInfo,
    status: str,
    limits: Limits,
) -> LimitHit | None:
    """Why *status* as *spec* is refused, or None when it fits (or isn't a place in line)."""
    if status not in LINE_STATUSES:
        return None
    line = [s for s in signups if s.status in LINE_STATUSES]
    mine = next((s for s in line if s.discord_user_id == discord_user_id), None)
    others = [s for s in line if s.discord_user_id != discord_user_id]
    class_limit = limits.classes.get(spec.column)  # the Tank column is never a class
    if class_limit is not None and (mine is None or column_of(mine) != spec.column):
        count = sum(1 for s in others if column_of(s) == spec.column)
        if count >= class_limit:
            return LimitHit("class", spec.column, count, class_limit)
    role_limit = limits.roles.get(spec.display_role)
    if role_limit is not None and (mine is None or _role_of(mine) != spec.display_role):
        count = sum(1 for s in others if _role_of(s) == spec.display_role)
        if count >= role_limit:
            return LimitHit("role", spec.display_role, count, role_limit)
    return None


@dataclass(frozen=True)
class LimitCheck:
    """One player asking for one status: which specs the raid's limits leave them."""

    limits: Limits
    signups: Sequence[WowRaidSignup]
    discord_user_id: str
    status: str  # what they'd get, never ``same``

    def hit(self, spec: WowSpecInfo) -> LimitHit | None:
        return limit_hit(
            self.signups, discord_user_id=self.discord_user_id, spec=spec, status=self.status, limits=self.limits
        )

    def blocks(self, column: str) -> dict[WowSpecInfo, LimitHit]:
        """*column*'s specs with no room for this player, and why."""
        hits = {spec: self.hit(spec) for spec in column_specs(column)}
        return {spec: hit for spec, hit in hits.items() if hit is not None}

    def closed(self, column: str) -> list[LimitHit]:
        """Why no spec in *column* has room (each reason once), or [] while one does."""
        blocks = self.blocks(column)
        if len(blocks) < len(column_specs(column)):
            return []
        return list(dict.fromkeys(blocks.values()))

    @property
    def mine(self) -> WowRaidSignup | None:
        """The player's sign-up, whatever its status."""
        return next((s for s in self.signups if s.discord_user_id == self.discord_user_id), None)

    @property
    def listed(self) -> bool:
        """The player is on the list now (anything but absence), so a refusal leaves them there."""
        mine = self.mine
        return mine is not None and mine.status in LISTED_STATUSES


def role_line_counts(signups: Iterable[WowRaidSignup]) -> dict[str, int]:
    """Players in line per role (tank / melee / ranged / healer): what a role limit counts."""
    counts = dict.fromkeys(LIMIT_ROLES, 0)
    for signup in signups:
        role = _role_of(signup)
        if signup.status in LINE_STATUSES and role is not None:
            counts[role] += 1
    return counts


def count_label(count: int, limit: int | None) -> str:
    """'3', or '3/4' under a limit."""
    if limit is None:
        return str(count)
    return f"{count}/{limit}"


def role_tally(signups: Sequence[WowRaidSignup], limits: Limits) -> dict[str, tuple[int, int | None]]:
    """Each role's (count, limit): a limited role's players in line, else its seat holders."""
    seated = role_counts(signups)
    in_line = role_line_counts(signups)
    tally: dict[str, tuple[int, int | None]] = {}
    for role in LIMIT_ROLES:
        tally[role] = (seated[role], None)
        if role in limits.roles:
            tally[role] = (in_line[role], limits.roles[role])
    return tally


def role_row(signups: Sequence[WowRaidSignup], limits: Limits) -> dict[str, str]:
    """The post's role row: a limited role's players in line over its limit, else its seat holders."""
    return {role: count_label(count, limit) for role, (count, limit) in role_tally(signups, limits).items()}


def role_room(signups: Iterable[WowRaidSignup], limits: Limits) -> dict[str, int]:
    """How many more players each limited role takes: its limit less the players in line."""
    in_line = role_line_counts(signups)
    return {role: max(limit - in_line[role], 0) for role, limit in limits.roles.items()}


def raid_gaps(event: WowRaidEvent, signups: Sequence[WowRaidSignup], seated: RoleCounts) -> RoleGaps:
    """The sign-up nudge's "Still need": the raid's size band, within its role limits."""
    return role_gaps(event.size_cap, seated, role_room(signups, Limits.of(event)))


def changed_keys(old: Mapping[str, int], new: Mapping[str, int]) -> set[str]:
    """Keys whose limit a save changed (set, moved or cleared)."""
    return {key for key in (*old, *new) if old.get(key) != new.get(key)}


def over_limit(signups: Sequence[WowRaidSignup], limits: Limits, keys: Iterable[str]) -> list[LimitHit]:
    """Of the limits named by *keys*, those the line is already past: nobody is removed.

    Roles first, then classes, each in post order.
    """
    wanted = set(keys)
    found: list[LimitHit] = []
    by_role = role_line_counts(signups)
    for role in LIMIT_ROLES:
        limit = limits.roles.get(role)
        if role in wanted and limit is not None and by_role[role] > limit:
            found.append(LimitHit("role", role, by_role[role], limit))
    by_column = column_counts(signups)
    for class_key in LIMIT_CLASSES:
        limit = limits.classes.get(class_key)
        if class_key in wanted and limit is not None and by_column[class_key] > limit:
            found.append(LimitHit("class", class_key, by_column[class_key], limit))
    return found


def _role_of(signup: WowRaidSignup) -> str | None:
    """tank / melee / ranged / healer, or None with no class or spec to tell."""
    spec = effective_spec(signup.wow_class, signup.role, signup.spec)
    if spec is None:
        return None
    return spec.display_role
