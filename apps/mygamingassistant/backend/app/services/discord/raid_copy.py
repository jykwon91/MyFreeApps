"""User-facing copy for the raid bot (fixed strings from the UX spec).

Strings that interpolate values live as small functions next to the
constants so the wording stays in one place.
"""
from __future__ import annotations

from typing import Final

ADMIN_COMMAND: Final = "raid-admin"

NOT_CONFIGURED: Final = f"This server isn't set up yet. Ask an admin to run `/{ADMIN_COMMAND} setup`."
NOT_PERMITTED_EVENTS: Final = "You need the Manage Events permission to schedule raids."
NOT_PERMITTED_GUILD: Final = "You need the Manage Server permission to set up the raid bot."
NOT_FOUND: Final = "I can't find that raid. It may have been cancelled. Try `/raid list`."
GENERIC_ERROR: Final = "Something went wrong on my end. Nothing changed, so please try again."
RAID_STARTED: Final = "This raid has already started."
MENU_TIMEOUT: Final = "That menu timed out. Tap Sign up again."
GUILD_ONLY: Final = "Use this in a server channel, not in DMs."

NEXT_TIME_ONE_TAP: Final = "Next time it's one tap."
BENCHED: Final = (
    "The raid is full, so I've put you on the bench. "
    "You'll be moved up automatically if someone drops out."
)
NOT_SIGNED_UP: Final = "You haven't signed up for this raid yet. Tap **Sign up** on the raid post."
CLASS_PROMPT: Final = "Which class are you bringing? I'll remember it for next time."

EDIT_NEEDS_A_CHANGE: Final = "Tell me what to change: add `when`, `size` or `notes`."
EDIT_DONE: Final = "Updated. The raid post now shows the new details."
DRAFT_DISCARDED: Final = "Okay, I didn't post anything."
CANCEL_KEPT: Final = "Okay, the raid stays on."
ALREADY_CANCELLED: Final = "That raid is already cancelled."
NO_UPCOMING: Final = f"No raids are scheduled yet. Organisers can post one with `/{ADMIN_COMMAND} create`."

TEST_DM_BODY: Final = (
    "This is a test from the raid bot. If you can read this, raid reminders will reach you here."
)
TEST_DM_SENT: Final = "Sent. Check your DMs."
TEST_DM_BLOCKED: Final = (
    "I couldn't DM you. Open this server's menu, choose **Privacy Settings**, "
    "turn on **Direct Messages**, then try again."
)
TEST_DM_FAILED: Final = "I couldn't reach Discord just now. Please try again in a minute."

SETUP_CHECK_FAILED: Final = (
    "I couldn't double-check my permissions there just now. If the first raid doesn't appear, "
    "give me View Channel, Send Messages and Embed Links in that channel."
)

_ALREADY: Final[dict[str, str]] = {
    "confirmed": "You're already signed up.",
    "tentative": "You're already tentative.",
    "late": "You're already marked as late.",
    "declined": "You've already declined.",
    "bench": "You're already on the bench. You'll be moved up automatically if someone drops out.",
}


_MARKED_WORDS: Final[dict[str, str]] = {"late": "late", "tentative": "tentative"}


def already_in_status(status: str) -> str:
    return _ALREADY.get(status, "Nothing changed.")


def spec_prompt(class_label: str) -> str:
    return f"Which spec are you playing as **{class_label}**? I'll remember it for next time."


def spec_switch_prompt(spec_label: str) -> str:
    return f"You're playing **{spec_label}**. Pick another spec to switch."


def signed_up_as(spec_label: str) -> str:
    return f"You're in as **{spec_label}**."


def switched_to(spec_label: str) -> str:
    return f"Switched to **{spec_label}**."


def saved_as(spec_label: str) -> str:
    return f"Saved as **{spec_label}**."


def marked_as(status: str, spec_label: str) -> str:
    """'You're marked **late** as Fury Warrior.'"""
    return f"You're marked **{_MARKED_WORDS.get(status, status)}** as {spec_label}."


def setup_ok(channel_id: str, ping_role_id: str | None, tz_name: str) -> str:
    if ping_role_id:
        return (
            f"All set. Raids will post in <#{channel_id}>, pinging <@&{ping_role_id}>. "
            f"Times are in {tz_name}."
        )
    return f"All set. Raids will post in <#{channel_id}>. Times are in {tz_name}."


def setup_missing_permissions(channel_id: str, labels: list[str]) -> str:
    return (
        f"Saved, but I can't post in <#{channel_id}> yet. In that channel's settings, give me: "
        f"**{', '.join(labels)}**. Then run `/{ADMIN_COMMAND} setup` again to re-check."
    )


def setup_role_not_pingable(role_id: str) -> str:
    return (
        f"Heads up: I can't ping <@&{role_id}> because it isn't mentionable. "
        "Turn on \"Allow anyone to @mention this role\" in the role settings."
    )


def unknown_timezone(value: str) -> str:
    return f"I don't recognise the timezone `{value[:64]}`. Pick one from the list, like `America/New_York`."


def size_too_small(min_size: int) -> str:
    return f"{min_size} players already have a seat. Pick a size of at least {min_size}."


def posting(channel_id: str) -> str:
    return f"Posting your raid in <#{channel_id}>…"


def posted(channel_id: str, link: str) -> str:
    return f"Posted in <#{channel_id}>. [Jump to the raid]({link})"


def already_posted(link: str | None) -> str:
    if link:
        return f"This raid is already posted. [Jump to the raid]({link})"
    return "This raid is already posted."


def post_refused(channel_id: str, discord_code: int | None) -> str:
    if discord_code in (50001, 50013):
        return (
            f"I don't have permission to post in <#{channel_id}>. Give me View Channel, Send Messages "
            "and Embed Links there, then tap **Post raid** again."
        )
    if discord_code == 10003:
        return f"I can't find that channel anymore. Run `/{ADMIN_COMMAND} setup` to pick a new one."
    return "Discord didn't accept the post, so nothing was posted. Tap **Post raid** to try again."


def cancel_prompt(raid_label: str, unix: int) -> str:
    return f"Cancel **{raid_label}** on <t:{unix}:F>? Everyone signed up will be told."


def cancelled_done(channel_id: str) -> str:
    return f"Cancelled. I've updated the raid post and let <#{channel_id}> know."


def cancellation_announcement(raid_label: str, day_label: str, reason: str | None) -> str:
    if reason:
        return f"{raid_label} on {day_label} has been cancelled: {reason}"
    return f"{raid_label} on {day_label} has been cancelled."


def cancellation_dm(raid_label: str, unix: int, reason: str | None) -> str:
    base = f"**{raid_label}** on <t:{unix}:F> has been cancelled."
    if reason:
        return f"{base}\nReason: {reason}"
    return base


def promoted_dm(raid_label: str, unix: int, link: str | None) -> str:
    text = f"Good news: a spot opened up in **{raid_label}** (<t:{unix}:F>). You're off the bench and confirmed."
    if link:
        return f"{text}\n[Jump to the raid]({link})"
    return text


# ---------------------------------------------------------------------------
# Scheduled notifications (raid_notification_worker)
# ---------------------------------------------------------------------------

DM_FOOTER: Final = "To stop these DMs, use /raid prefs dm_reminders:false"
CLASSIC_CAVEAT: Final = "*Classic advice, which may differ in Forever.*"
DM_FALLBACK_HEAD: Final = "I couldn't DM "
DM_FALLBACK_TAIL: Final = ". Open DMs from this server to get reminders, or use `/raid prefs`."


def nudge_headline(raid_label: str, unix: int) -> str:
    return f"**{raid_label} is <t:{unix}:R>.**"


def ready_check_headline(raid_label: str, unix: int) -> str:
    return f"**Ready check — {raid_label} starts <t:{unix}:R>.**"


def consumables_title(raid_label: str, day_word: str, class_role: str) -> str:
    return f"{raid_label} {day_word} — {class_role}"


def generic_reminder_dm(raid_label: str, unix: int, link: str | None) -> str:
    """Reminder for a player with no class picked — no checklist to personalise."""
    text = (
        f"**{raid_label}** starts <t:{unix}:R> (<t:{unix}:F>). "
        "Tell me your class and spec with `/raid prefs` and I'll send you a consumables checklist next time."
    )
    if link:
        text = f"{text}\n[Jump to the raid]({link})"
    return f"{text}\n-# {DM_FOOTER}"
