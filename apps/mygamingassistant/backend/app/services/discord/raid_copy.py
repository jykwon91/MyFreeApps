"""User-facing copy for the raid bot (fixed strings from the UX spec).

Strings that interpolate values live as small functions next to the
constants so the wording stays in one place.  The create preview's own
copy is in ``raid_draft_copy``.
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

SETUP_NO_EVERYONE: Final = (
    "I don't ping `@everyone`. Pick a role for your raiders, or leave `ping_role` out "
    "so raids post without a ping."
)
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


def promoted_dm(raid_label: str, unix: int, link: str | None, *, ask_leader: str | None = None) -> str:
    """*ask_leader*: the raid's leader, once sign-ups have closed (the post's Absence button no longer works)."""
    text = (
        f"Good news: a seat opened up in **{raid_label}** (<t:{unix}:F>, <t:{unix}:R>), "
        "so I've moved you up from the queue. You're confirmed. "
    )
    if ask_leader is None:
        text += "Can't make it any more? Tap **Absence** on the raid post so someone else can have the seat."
    else:
        text += f"Can't make it any more? Let <@{ask_leader}> know so someone else can have the seat."
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
# Raid: Edit (raid_edit)
# ---------------------------------------------------------------------------

EDIT_PROMPT: Final = "Pick what you want to change."
EDIT_FOOTER: Final = "changes show on the raid post within a second"
EDIT_SAVED: Final = "Saved."
EDIT_GONE_PROMPT: Final = "This raid is cancelled or finished. You can copy it to a new date, repeat it, or delete it."
TITLE_OK: Final = "Title updated."
TITLE_EMPTY: Final = "The title can't be empty."
DESC_OK: Final = "Description updated."
DESC_CLEARED: Final = "Description cleared."
BANNER_OK: Final = "Banner updated."
BANNER_RESET: Final = "Back to the raid's own banner."
BANNER_BAD: Final = "That isn't a link I can use. It must start with https:// and point to an image."
COLOR_OK: Final = "Color updated."
COLOR_OK_CLOSED: Final = "Color updated. The post stays grey while sign-ups are closed."
WHEN_SAME: Final = "That's already when the raid starts."
LEADER_BOT: Final = "Pick a person, not a bot."
# The right-click commands need Manage Events unless the server allows them
# for others (Server Settings → Integrations), so a hand-over says so.
LEADER_PROMPT: Final = (
    "Who leads this raid? The post names them and they get its right-click tools. "
    "Without Manage Events they only see those if the server allows it (Server Settings → Integrations)."
)
COLOR_PROMPT: Final = "Pick a color for the raid post."
NOTIFY_BUTTON: Final = "Tell them in channel"
DELETING: Final = "Deleting…"
DELETED: Final = "Deleted."
DELETE_POST_LEFT: Final = "Deleted the raid, but I couldn't remove its post. You can delete the post yourself."

TITLE_MODAL: Final = "Edit title"
TITLE_LABEL: Final = "Title"
TITLE_HINT: Final = "Up to 19 letters and numbers show as letter tiles on the post."
WHEN_MODAL: Final = "Change date and time"
WHEN_HINT: Final = "e.g. sat 8pm, 10/14 8:00pm"
DESC_MODAL: Final = "Edit description"
DESC_LABEL: Final = "Description"
DESC_HINT: Final = "Shown on the raid post. Leave it empty to remove it."
IMAGE_MODAL: Final = "Banner image"
IMAGE_LABEL: Final = "Image link"
IMAGE_HINT: Final = "An https link to an image. Leave it empty for the raid's own banner."
CANCEL_MODAL: Final = "Cancel this raid"
CANCEL_LABEL: Final = "Reason (optional)"
CANCEL_HINT: Final = "Shown to players on the raid post and in their DM."


def when_label(tz_name: str) -> str:
    """The time field's label, naming the server's timezone (≤ 45 characters)."""
    return f"When ({tz_name})"[:45]


def leader_ok(name: str) -> str:
    return f"Leader is now {name}."


def handed_over(name: str) -> str:
    """The leader handed the raid to someone else and can't edit it any more."""
    return f"{name} leads this raid now, so it's theirs to edit."


def moved(unix: int) -> str:
    return f"Moved to <t:{unix}:F>."


def notify_offer(count: int) -> str:
    """After a move, when anyone is on the raid."""
    if count == 1:
        return "1 person is signed up. Tell them about the new time?"
    return f"{count} people are signed up. Tell them about the new time?"


def notify_post(raid_label: str, unix: int) -> str:
    """[Tell them in channel] — the reply to the raid post, pinging everyone on it."""
    return f"{raid_label} has moved to <t:{unix}:F> (<t:{unix}:R>). Please check you can still make it."


def delete_prompt(raid_label: str, signups: int, *, can_cancel: bool, attendance: bool = False) -> str:
    if signups == 0:
        removes = "This removes the post."
    elif signups == 1:
        removes = "This removes the post and its 1 sign-up."
    else:
        removes = f"This removes the post and all {signups} sign-ups."
    if attendance:
        removes += " Its attendance record goes too."
    text = f"Delete **{raid_label}**? {removes} Nobody is notified."
    if can_cancel:
        text += " To tell people, use **Cancel raid** instead."
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
