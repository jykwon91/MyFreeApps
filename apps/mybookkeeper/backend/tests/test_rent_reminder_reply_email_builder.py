"""The email that hands a tenant's reply to their landlord (pure)."""
from __future__ import annotations

import datetime as _dt
import re

import pytest

from app.core.rent_reminder_constants import TWILIO_MESSAGE_LOG_URL
from app.services.rent.rent_reminder_reply_email import ReplyEmail
from app.services.rent.rent_reminder_reply_email_builder import build_reply_email

PAGE = "https://app.example/tenants/0b9c2f4e-1111-4222-8333-944455556666"


def _email(**overrides: object) -> ReplyEmail:
    fields: dict[str, object] = {
        "tenant_name": "Sonu Patel",
        "other_tenant_names": [],
        "due_date": _dt.date(2026, 11, 1),
        "property_label": None,
        "body": "Paid, thanks!",
        "opt_out": None,
        "media_content_types": (),
        "sender_last_digits": "0100",
        "tenant_page_url": PAGE,
    }
    fields.update(overrides)
    return build_reply_email(**fields)  # type: ignore[arg-type]


def _links(html: str) -> list[str]:
    return re.findall(r'href="([^"]*)"', html)


class TestAPlainReply:
    def test_subject_names_the_tenant(self) -> None:
        assert _email().subject == "Sonu replied to your rent text"

    def test_says_who_it_is_from_and_which_reminder_it_answers(self) -> None:
        assert "<p>Sonu Patel replied to your text about rent due Nov 1:</p>" in _email().html

    def test_names_the_property_when_there_is_one(self) -> None:
        html = _email(property_label="12 Oak St").html
        assert "replied to your text about rent due Nov 1 for 12 Oak St:" in html

    def test_quotes_the_whole_text(self) -> None:
        html = _email(body="Paid via Zelle.\nThe sink is leaking again.").html
        assert re.search(
            r"<blockquote style=\"[^\"]+\">Paid via Zelle\.<br>The sink is leaking again\.</blockquote>",
            html,
        )

    def test_says_how_to_answer_without_the_full_number(self) -> None:
        html = _email().html
        assert (
            "<p>To answer, text or call Sonu from your own phone. Their number ends in 0100, and "
            f'it\'s on <a href="{PAGE}">their page in MyBookkeeper</a>. '
            "Replying to this email won't reach them.</p>"
        ) in html

    def test_links_only_to_the_tenants_page(self) -> None:
        assert _links(_email().html) == [PAGE]

    def test_paragraphs_come_in_reading_order(self) -> None:
        html = _email(
            body="stop",
            opt_out="stop",
            media_content_types=("image/jpeg",),
            other_tenant_names=["Ravi Patel"],
        ).html
        order = [
            html.index("replied to your text about rent due"),
            html.index("<blockquote"),
            html.index("A reply like this stops"),
            html.index("They also sent"),
            html.index("This number is also on file for"),
            html.index("To answer, text or call"),
        ]
        assert order == sorted(order)


class TestEscaping:
    def test_the_tenants_text_cannot_add_markup(self) -> None:
        html = _email(body='<script>alert("x")</script> <a href="https://evil.example">pay here</a> & more').html
        assert "<script>" not in html
        assert "evil.example" not in _links(html)
        assert (
            "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &lt;a "
            "href=&quot;https://evil.example&quot;&gt;pay here&lt;/a&gt; &amp; more"
        ) in html

    def test_names_property_and_link_are_escaped(self) -> None:
        html = _email(
            tenant_name="<b>Bo</b> Smith",
            property_label="Unit <2> & yard",
            other_tenant_names=['Al "Sunny" <i>Ray</i>'],
            tenant_page_url='https://app.example/tenants/x"onmouseover="y',
        ).html
        for raw in ("<b>", "<i>", 'x"onmouseover'):
            assert raw not in html
        assert "&lt;b&gt;Bo&lt;/b&gt; Smith replied" in html
        assert "for Unit &lt;2&gt; &amp; yard:" in html
        assert "Al &quot;Sunny&quot; &lt;i&gt;Ray&lt;/i&gt;" in html
        assert _links(html) == ["https://app.example/tenants/x&quot;onmouseover=&quot;y"]

    def test_the_last_digits_are_escaped(self) -> None:
        assert "&lt;01" in _email(sender_last_digits="<01").html


class TestUnnamedTenant:
    @pytest.mark.parametrize("name", [None, "", "   "])
    def test_reads_as_a_tenant(self, name: str | None) -> None:
        email = _email(tenant_name=name)
        assert email.subject == "A tenant replied to your rent text"
        assert "<p>A tenant replied to your text about rent due Nov 1:</p>" in email.html
        assert "text or call the tenant from your own phone" in email.html


class TestOptOutKeywords:
    def test_stop(self) -> None:
        email = _email(body="STOP", opt_out="stop")
        assert email.subject == "Sonu asked you to stop texting"
        assert ">STOP</blockquote>" in email.html
        assert (
            "<p>A reply like this stops all texts to their number, so your next rent text to Sonu "
            "won't go through. Send reminders by email instead, or ask Sonu to text START to the "
            "number your reminders come from.</p>"
        ) in email.html

    def test_start(self) -> None:
        email = _email(body="START", opt_out="start")
        assert email.subject == "Sonu can get your rent texts again"
        assert "<p>A reply like this lets your rent texts reach Sonu again.</p>" in email.html

    def test_help(self) -> None:
        email = _email(body="HELP", opt_out="help")
        assert email.subject == "Sonu asked for help with your rent texts"
        assert (
            "<p>Twilio already answered with its standard message about how to stop these texts.</p>"
        ) in email.html

    def test_an_ordinary_reply_has_no_note(self) -> None:
        html = _email().html
        assert "A reply like this" not in html
        assert "Twilio already answered" not in html


class TestAttachments:
    def test_pictures_and_no_text(self) -> None:
        email = _email(body="", media_content_types=("image/jpeg", "image/png"))
        assert email.subject == "Sonu replied to your rent text"
        assert (
            "<p>Sonu Patel replied to your text about rent due Nov 1 with 2 pictures and no message.</p>"
        ) in email.html
        assert (
            "<p>This email can't show them. You can see them in the messaging logs in the "
            f'<a href="{TWILIO_MESSAGE_LOG_URL}">Twilio console</a>, or ask Sonu to send them '
            "another way.</p>"
        ) in email.html
        assert "They also sent" not in email.html
        assert "<blockquote" not in email.html

    def test_one_picture_with_text(self) -> None:
        html = _email(body="Here's the receipt", media_content_types=("image/jpeg",)).html
        assert "<p>They also sent 1 picture. This email can't show it. You can see it in" in html
        assert "or ask Sonu to send it another way.</p>" in html

    @pytest.mark.parametrize(
        ("content_types", "phrase"),
        [
            (("image/jpeg", "image/gif", "application/pdf"), "2 pictures and 1 other file"),
            (("image/heic", "text/vcard", "audio/amr"), "1 picture and 2 other files"),
            (("application/pdf",), "1 file"),
            (("video/mp4", ""), "2 files"),
        ],
    )
    def test_says_what_was_sent(self, content_types: tuple[str, ...], phrase: str) -> None:
        assert f"They also sent {phrase}." in _email(media_content_types=content_types).html

    def test_links_only_to_the_console_and_the_tenants_page(self) -> None:
        html = _email(media_content_types=("image/jpeg",)).html
        assert _links(html) == [TWILIO_MESSAGE_LOG_URL, PAGE]

    def test_an_empty_text_with_nothing_attached(self) -> None:
        html = _email(body="  \n ").html
        assert "<p>Sonu Patel replied to your text about rent due Nov 1 with an empty message.</p>" in html
        assert "<blockquote" not in html


class TestOtherTenantsOnTheNumber:
    def test_none(self) -> None:
        assert "also on file" not in _email().html

    def test_one(self) -> None:
        assert "<p>This number is also on file for Ravi Patel.</p>" in _email(
            other_tenant_names=["Ravi Patel"],
        ).html

    def test_several_with_unnamed_ones(self) -> None:
        html = _email(other_tenant_names=["Ravi Patel", None, "Mina Shah", "  "]).html
        assert "<p>This number is also on file for Ravi Patel, Mina Shah and 2 other tenants.</p>" in html

    def test_one_unnamed(self) -> None:
        assert "<p>This number is also on file for Ravi Patel and another tenant.</p>" in _email(
            other_tenant_names=["Ravi Patel", None],
        ).html

    def test_only_unnamed(self) -> None:
        assert "<p>This number is also on file for another tenant.</p>" in _email(
            other_tenant_names=[None],
        ).html
