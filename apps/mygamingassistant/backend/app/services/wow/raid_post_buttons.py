"""The raid post's buttons — [Tank] and one per class, then the statuses.

Laid out like Raid-Helper's: each class button shows its column's icon and
count ("WAR 3" until the icons are uploaded), over its limit when the raid
has one ("3/4"; [Tank] shows Max tanks); then [Late] [Tentative]
[Bench] [Absence] [My sign-up], five to a row.  Once sign-ups close (the
leader, or the deadline), every button but [My sign-up] is disabled; once
the raid has started or is no longer scheduled, all of them are.

Row 4 is [Web view], a link to the raid's web page (``raid_web_links``),
there once the raid is posted from a public https origin (production), and
[Groups] while the leader shares the raid's groups (``gp:view``: they come
back privately).  Neither is ever disabled.
"""
from __future__ import annotations

from collections.abc import Sequence
from typing import Any, Final

from platform_shared.services.discord import (
    BUTTON_STYLE_LINK,
    BUTTON_STYLE_SECONDARY,
    COMPONENT_TYPE_ACTION_ROW,
    COMPONENT_TYPE_BUTTON,
    EmojiSet,
)

from app.models.wow.wow_raid_event import WowRaidEvent
from app.models.wow.wow_raid_signup import WowRaidSignup
from app.services.wow import raid_custom_id
from app.services.wow.raid_catalog import POST_COLUMNS, column_icon, column_tag
from app.services.wow.raid_deadline import is_started
from app.services.wow.raid_limits import Limits, count_label
from app.services.wow.raid_post_layout import column_counts
from app.services.wow.raid_web_links import raid_page_url

# The status buttons under the class buttons: (status, label, icon).
_STATUS_BUTTONS: Final = (
    ("late", "Late", "status_late"),
    ("tentative", "Tentative", "status_tentative"),
    ("bench", "Bench", "status_bench"),
    ("absence", "Absence", "status_absence"),
)
_BUTTONS_PER_ROW: Final = 5


def build_signup_components(
    event: WowRaidEvent, signups: Sequence[WowRaidSignup], *, emojis: EmojiSet
) -> list[dict[str, Any]]:
    """Class buttons with their column counts, then the status buttons, then [Web view] [Groups].

    [My sign-up] still works while sign-ups are closed, until the raid
    starts: it shows where you stand and the full roster.
    """
    over = event.status != "scheduled" or is_started(event)
    disabled = over or event.closed_at is not None
    counts = column_counts(signups)
    limits = Limits.of(event)
    class_buttons = [
        _class_button(event, column, count_label(counts[column], limits.for_column(column)), disabled, emojis)
        for column in POST_COLUMNS
    ]
    status_buttons = [
        _button(raid_custom_id.encode("status", event.id, status), label, disabled, emojis.component(icon))
        for status, label, icon in _STATUS_BUTTONS
    ]
    status_buttons.append(
        _button(raid_custom_id.encode("mine", event.id), "My sign-up", over, emojis.component("ui_gear"))
    )
    rows = [class_buttons[i : i + _BUTTONS_PER_ROW] for i in range(0, len(class_buttons), _BUTTONS_PER_ROW)]
    rows.append(status_buttons)
    links: list[dict[str, Any]] = []
    page = raid_page_url(event)
    if page is not None:
        links.append(link_button("Web view", page, emojis.component("info_globe")))
    if event.groups_published_at is not None:
        groups = raid_custom_id.encode("gp", event.id, "view")
        links.append(_button(groups, "Groups", False, emojis.component("info_signups")))
    if links:
        rows.append(links)
    return [{"type": COMPONENT_TYPE_ACTION_ROW, "components": row} for row in rows]


def _class_button(
    event: WowRaidEvent, column: str, count: str, disabled: bool, emojis: EmojiSet
) -> dict[str, Any]:
    """The column's icon and count ("WAR 3" until the icons are uploaded)."""
    emoji = emojis.component(column_icon(column))
    label = count
    if emoji is None:
        label = f"{column_tag(column)} {count}"
    return _button(raid_custom_id.encode("cls", event.id, column), label, disabled, emoji)


def _button(custom_id: str, label: str, disabled: bool, emoji: dict[str, str] | None) -> dict[str, Any]:
    button: dict[str, Any] = {
        "type": COMPONENT_TYPE_BUTTON,
        "style": BUTTON_STYLE_SECONDARY,
        "label": label,
        "custom_id": custom_id,
        "disabled": disabled,
    }
    if emoji is not None:
        button["emoji"] = emoji
    return button


def link_button(label: str, url: str, emoji: dict[str, str] | None) -> dict[str, Any]:
    """A link button: Discord opens *url*; no custom_id, so no interaction comes back."""
    button: dict[str, Any] = {"type": COMPONENT_TYPE_BUTTON, "style": BUTTON_STYLE_LINK, "label": label, "url": url}
    if emoji is not None:
        button["emoji"] = emoji
    return button
