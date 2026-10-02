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
CLOSED: Final = "Sign-ups are closed for this raid."
MENU_TIMEOUT: Final = "That menu timed out. Tap your class on the raid post again."
GUILD_ONLY: Final = "Use this in a server channel, not in DMs."

NEXT_TIME_ONE_TAP: Final = "Next time it's one tap."
# How to take a seat: the class buttons, or [Tank] for a tank (one tap with the saved tank spec).
_TAP_FOR_A_SEAT: Final = "Tap your class (or **Tank**)"
QUEUE_MOVES_UP: Final = "I'll move you up automatically when a seat opens."
BENCH_NOTE: Final = (
    "Bench is for backups, so I won't move you into a seat automatically. "
    f"{_TAP_FOR_A_SEAT} on the raid post to ask for one."
)
TENTATIVE_NOTE: Final = f"Tentative doesn't hold a seat. {_TAP_FOR_A_SEAT} on the raid post to take one."
SEAT_KEPT: Final = "Okay, you keep your seat."
NO_SEAT_TO_FREE: Final = (
    "You don't hold a seat any more, so this question is out of date. Use the buttons on the raid post."
)
LEFT_QUEUE: Final = f"You've left the queue. {_TAP_FOR_A_SEAT} on the raid post to rejoin it at the back."
NOT_SIGNED_UP: Final = "You haven't signed up for this raid yet. Tap your class on the raid post."
NOBODY_SIGNED_UP: Final = "Nobody has signed up yet."
CLASS_PROMPT: Final = "Which class are you bringing? I'll remember it for next time."
TANK_PROMPT: Final = "Which tank are you bringing? I'll remember it for next time."
# A tank spec in a class's spec select: it shows in the Tanks column, not the class's.
TANK_SPEC_NOTE: Final = "Tank (shows under Tanks)"

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
    "late": "You're already marked **late**.",
    "tentative": "You're already marked **tentative**.",
    "bench": f"You're already on the **bench**. {_TAP_FOR_A_SEAT} if you want a seat.",
    "absence": f"You're already marked **absent**. {_TAP_FOR_A_SEAT} if your plans change.",
}

_MARKED_WORDS: Final[dict[str, str]] = {"late": "late", "tentative": "tentative", "absence": "absent"}

# The seat confirm: a seat holder leaving while players are queued.
_RELEASE_QUESTIONS: Final[dict[str, str]] = {
    "tentative": "Mark yourself **tentative**?",
    "bench": "Move to the **bench**?",
    "absence": "Mark yourself **absent**?",
}
_RELEASED: Final[dict[str, str]] = {
    "tentative": "You're marked **tentative**.",
    "bench": "You're on the **bench**.",
    "absence": "You're marked **absent**.",
}


def already_in_status(
    status: str, *, spec_label: str | None = None, queue_position: int | None = None, asked_late: bool = False
) -> str:
    """Same status again: say so, and point at what they probably wanted instead."""
    if status == "queued":
        if asked_late:
            return late_while_queued(queue_position)
        return f"You're already **{queue_place(queue_position)}**. {QUEUE_MOVES_UP}"
    if status == "confirmed" and spec_label:
        return f"You're already signed up as **{spec_label}**. To switch spec, tap **My sign-up**."
    return _ALREADY.get(status, "Nothing changed.")


def queue_place(position: int | None) -> str:
    """'#2 in the queue' — or just 'in the queue' when the place isn't known."""
    if position is None:
        return "in the queue"
    return f"#{position} in the queue"


def queued_note(position: int | None, *, asked_late: bool = False) -> str:
    """Asked for a seat while the raid is full."""
    if asked_late:
        return late_while_queued(position)
    return f"The raid is full, so you're **{queue_place(position)}**. {QUEUE_MOVES_UP}"


def late_while_queued(position: int | None) -> str:
    """Late holds a seat, so a full raid queues it; moving up makes you confirmed."""
    return (
        f"The raid is full, so I can't mark you late yet. You're **{queue_place(position)}**. "
        "Once I move you up, tap **Late**."
    )


def release_prompt(status: str) -> str:
    return (
        "Players are waiting in the queue, so your seat goes to the next one right away. "
        "If you want it back later, you'll join the back of the queue. "
        + _RELEASE_QUESTIONS.get(status, "Give up your seat?")
    )


def seat_released(status: str, *, handed_on: bool) -> str:
    text = _RELEASED.get(status, "Done.")
    if handed_on:
        text += " Your seat went to the next player in the queue."
    return text


def preview_intro(channel_id: str, ping_role_id: str | None) -> str:
    """Above the create preview: where the post goes and who it pings."""
    where = f"<#{channel_id}>"
    if ping_role_id:
        where += f", pinging <@&{ping_role_id}>"
    return f"**Preview.** This is how the raid will look in {where}. Does this look right?"


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
    """'You're marked **late** as Fury Warrior.' — the bench also says what bench means."""
    if status == "bench":
        return f"You're on the **bench** as {spec_label}. {BENCH_NOTE}"
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
    text = (
        f"Good news: a seat opened up in **{raid_label}** (<t:{unix}:F>, <t:{unix}:R>), "
        "so I've moved you up from the queue. You're confirmed. "
        "Can't make it any more? Tap **Absence** on the raid post so someone else can have the seat."
    )
    if link:
        return f"{text}\n[Jump to the raid]({link})"
    return text


# ---------------------------------------------------------------------------
# The raid post's right-click menu (raid_leader)
# ---------------------------------------------------------------------------

NOT_LEADER: Final = "Only this raid's leader or someone with Manage Events can do that."
NOT_A_RAID: Final = "That isn't one of my raid posts. Right-click a raid post and try again."
CLOSED_OK: Final = (
    "Sign-ups are **closed**. Nobody can sign up or change their sign-up until you reopen them."
)
OPENED_OK: Final = "Sign-ups are **open** again."
ALREADY_CLOSED: Final = "Sign-ups are already closed."
ALREADY_OPEN: Final = "Sign-ups are already open."
PING_WAIT: Final = "I pinged them a moment ago. Try again in a few minutes."
PING_NOBODY: Final = "There's nobody on the list to ping right now."
PING_EMPTY: Final = "Type a message to go with the ping."
PING_MODAL_TITLE: Final = "Ping signed members"
PING_FIELD_LABEL: Final = "Message"
PING_FIELD_HINT: Final = "Posted in the raid's channel as a reply to the raid post, pinging everyone on it."


def ping_prefill(raid_label: str) -> str:
    return f"Reminder: {raid_label} is coming up. Please be online and ready on time."


def _people(count: int) -> str:
    if count == 1:
        return "1 person"
    return f"{count} people"


def pinging(count: int) -> str:
    return f"Pinging {_people(count)}…"


def ping_sent(count: int) -> str:
    return f"Sent. I pinged {_people(count)}."


def ping_partly_sent(sent: int, total: int) -> str:
    return (
        f"I pinged {sent} of {_people(total)} before Discord refused the rest. "
        f"Pinging again in a few minutes reaches everyone, the {sent} already pinged included."
    )


def ping_unconfirmed(channel_id: str) -> str:
    """Discord never answered (or the send broke): the ping may have gone out."""
    return (
        f"I couldn't confirm the ping went out. Check <#{channel_id}>: "
        "if it isn't there, you can ping again in a few minutes."
    )


def ping_refused(channel_id: str, discord_code: int | None) -> str:
    if discord_code in (50001, 50013):
        return (
            f"I can't post in <#{channel_id}>, so nobody was pinged. Give me View Channel and "
            "Send Messages there, then try again."
        )
    return "Discord didn't take the ping, so nobody was pinged. Please try again."


def ping_signature(raid_label: str, unix: int, leader: str) -> str:
    """The small print under a ping: which raid, when, and who sent it."""
    return f"-# {raid_label} · <t:{unix}:F> · sent by {leader}"


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
