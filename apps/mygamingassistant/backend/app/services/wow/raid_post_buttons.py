"""The raid post's buttons — [Tank] and one per class, then the statuses.

Laid out like Raid-Helper's: each class button shows its column's icon and
count ("WAR 3" until the icons are uploaded); then [Late] [Tentative]
[Bench] [Absence] [My sign-up], five to a row.  Every button is disabled
once the raid is no longer open.
"""
from __future__ import annotations

from collections.abc import Sequence
from typing import Any, Final

from platform_shared.services.discord import (
    BUTTON_STYLE_SECONDARY,
    COMPONENT_TYPE_ACTION_ROW,
    COMPONENT_TYPE_BUTTON,
    EmojiSet,
)

from app.models.wow.wow_raid_event import WowRaidEvent
from app.models.wow.wow_raid_signup import WowRaidSignup
from app.services.wow import raid_custom_id
from app.services.wow.raid_catalog import POST_COLUMNS, column_icon, column_tag
from app.services.wow.raid_post_layout import column_counts

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
    """Class buttons with their column counts, then the status buttons.

    Every button is disabled once the raid is no longer open.
    """
    disabled = event.status != "scheduled"
    counts = column_counts(signups)
    class_buttons = [_class_button(event, column, counts[column], disabled, emojis) for column in POST_COLUMNS]
    status_buttons = [
        _button(raid_custom_id.encode("status", event.id, status), label, disabled, emojis.component(icon))
        for status, label, icon in _STATUS_BUTTONS
    ]
    status_buttons.append(
        _button(raid_custom_id.encode("mine", event.id), "My sign-up", disabled, emojis.component("ui_gear"))
    )
    rows = [class_buttons[i : i + _BUTTONS_PER_ROW] for i in range(0, len(class_buttons), _BUTTONS_PER_ROW)]
    rows.append(status_buttons)
    return [{"type": COMPONENT_TYPE_ACTION_ROW, "components": row} for row in rows]


def _class_button(
    event: WowRaidEvent, column: str, count: int, disabled: bool, emojis: EmojiSet
) -> dict[str, Any]:
    """The column's icon and count ("WAR 3" until the icons are uploaded)."""
    emoji = emojis.component(column_icon(column))
    label = str(count)
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
