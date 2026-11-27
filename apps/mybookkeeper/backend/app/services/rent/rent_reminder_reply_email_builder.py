"""Write the email that hands a tenant's reply to their landlord.

Pure. Every value is escaped here, and the tenant's text is shown in full
(Twilio allows up to 1,600 characters) in a quote block, so it reads apart
from MyBookkeeper's own words. The email never carries the sender's full
number, a link to anything they attached, or a Reply-To: the landlord answers
from their own phone.
"""
from __future__ import annotations

import datetime as _dt
import html
from collections.abc import Sequence

from platform_shared.services.twilio_opt_out_kind import TwilioOptOutKind

from app.core.html_text import text_to_html
from app.core.rent_reminder_constants import TWILIO_MESSAGE_LOG_URL
from app.core.wording_utils import count_phrase, join_with_and
from app.services.rent.rent_reminder_message import first_name, short_date
from app.services.rent.rent_reminder_reply_email import ReplyEmail

_UNNAMED = "A tenant"
_UNNAMED_SHORT = "the tenant"
_ONE_UNNAMED_OTHER = "another tenant"
_IMAGE_TYPE_PREFIX = "image/"
_QUOTE_STYLE = (
    "margin: 12px 0; padding: 8px 12px; border-left: 3px solid #d0d7de; background: #f6f8fa;"
)
# What the subject says the tenant did, after their first name.
_SUBJECT_ACTIONS: dict[TwilioOptOutKind | None, str] = {
    None: "replied to your rent text",
    "stop": "asked you to stop texting",
    "start": "can get your rent texts again",
    "help": "asked for help with your rent texts",
}


def build_reply_email(
    *,
    tenant_name: str | None,
    other_tenant_names: Sequence[str | None],
    due_date: _dt.date,
    property_label: str | None,
    body: str,
    opt_out: TwilioOptOutKind | None,
    media_content_types: Sequence[str],
    sender_last_digits: str,
    tenant_page_url: str,
) -> ReplyEmail:
    """The landlord's email about one reply.

    ``tenant_name`` is the legal name of the tenant whose reminder text is the
    newest one to the number; ``other_tenant_names`` are the landlord's other
    tenants that reminder texts to the same number went to.
    """
    full = (tenant_name or "").strip()
    subject_name, who, short = _UNNAMED, _UNNAMED, _UNNAMED_SHORT
    if full:
        subject_name, who, short = first_name(full), full, first_name(full)
    safe_who = html.escape(who)
    safe_short = html.escape(short)
    about = f"your text about rent due {short_date(due_date)}"
    if property_label:
        about += f" for {html.escape(property_label)}"

    text = body.strip()
    media = _media_phrase(media_content_types)
    blocks: list[str] = []
    if text:
        blocks.append(_paragraph(f"{safe_who} replied to {about}:"))
        blocks.append(f'<blockquote style="{_QUOTE_STYLE}">{text_to_html(text)}</blockquote>')
    elif media:
        blocks.append(_paragraph(f"{safe_who} replied to {about} with {media} and no message."))
    else:
        blocks.append(_paragraph(f"{safe_who} replied to {about} with an empty message."))
    note = _opt_out_note(opt_out, safe_short)
    if note:
        blocks.append(_paragraph(note))
    if media:
        blocks.append(_paragraph(_media_note(
            media=media, count=len(media_content_types), short=safe_short, after_text=bool(text),
        )))
    others = _others_line(other_tenant_names)
    if others:
        blocks.append(_paragraph(others))
    blocks.append(_paragraph(
        f"To answer, text or call {safe_short} from your own phone. Their number ends in "
        f"{html.escape(sender_last_digits)}, and it's on "
        f'<a href="{html.escape(tenant_page_url)}">their page in MyBookkeeper</a>. '
        "Replying to this email won't reach them."
    ))
    return ReplyEmail(subject=f"{subject_name} {_SUBJECT_ACTIONS[opt_out]}", html="".join(blocks))


def _paragraph(inner_html: str) -> str:
    return f"<p>{inner_html}</p>"


def _opt_out_note(opt_out: TwilioOptOutKind | None, short: str) -> str | None:
    """What an opt-out keyword means for the landlord's texts. Worded as Twilio's rule, which
    is all we know: the tenant's actual state lives in Twilio."""
    if opt_out == "stop":
        return (
            "A reply like this stops all texts to their number, so your next rent text to "
            f"{short} won't go through. Send reminders by email instead, or ask {short} to "
            "text START to the number your reminders come from."
        )
    if opt_out == "start":
        return f"A reply like this lets your rent texts reach {short} again."
    if opt_out == "help":
        return "Twilio already answered with its standard message about how to stop these texts."
    return None


def _media_phrase(content_types: Sequence[str]) -> str | None:
    """``2 pictures``, ``1 file``, ``2 pictures and 1 other file``; ``None`` for no attachments."""
    pictures = sum(1 for content_type in content_types if content_type.startswith(_IMAGE_TYPE_PREFIX))
    files = len(content_types) - pictures
    if pictures and files:
        return (
            f"{count_phrase(pictures, 'picture', 'pictures')} and "
            f"{count_phrase(files, 'other file', 'other files')}"
        )
    if pictures:
        return count_phrase(pictures, "picture", "pictures")
    if files:
        return count_phrase(files, "file", "files")
    return None


def _media_note(*, media: str, count: int, short: str, after_text: bool) -> str:
    pronoun = "it"
    if count > 1:
        pronoun = "them"
    where = (
        f"This email can't show {pronoun}. You can see {pronoun} in the messaging logs in the "
        f'<a href="{html.escape(TWILIO_MESSAGE_LOG_URL)}">Twilio console</a>, or ask {short} '
        f"to send {pronoun} another way."
    )
    if after_text:
        return f"They also sent {media}. {where}"
    return where


def _others_line(other_tenant_names: Sequence[str | None]) -> str | None:
    names = [html.escape(name.strip()) for name in other_tenant_names if (name or "").strip()]
    unnamed = len(other_tenant_names) - len(names)
    if unnamed == 1:
        names.append(_ONE_UNNAMED_OTHER)
    elif unnamed > 1:
        names.append(f"{unnamed} other tenants")
    if not names:
        return None
    return f"This number is also on file for {join_with_and(names)}."
