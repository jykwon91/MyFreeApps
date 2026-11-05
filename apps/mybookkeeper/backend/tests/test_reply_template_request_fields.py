"""What the reply template create and update requests accept."""
import pytest
from pydantic import ValidationError

from app.schemas.inquiries.reply_template_body import REPLY_TEMPLATE_BODY_MAX_LENGTH
from app.schemas.inquiries.reply_template_create_request import ReplyTemplateCreateRequest
from app.schemas.inquiries.reply_template_name import REPLY_TEMPLATE_NAME_MAX_LENGTH
from app.schemas.inquiries.reply_template_subject import REPLY_TEMPLATE_SUBJECT_MAX_LENGTH
from app.schemas.inquiries.reply_template_update_request import ReplyTemplateUpdateRequest

VALID = {"name": "Welcome", "subject_template": "Re: $listing", "body_template": "Hi $name"}


def test_name_and_subject_are_trimmed_and_the_message_is_kept_as_written() -> None:
    request = ReplyTemplateCreateRequest(
        name="  Welcome ", subject_template=" Re: $listing ", body_template="\n  Hi $name\n\nThanks\n",
    )
    assert request.name == "Welcome"
    assert request.subject_template == "Re: $listing"
    assert request.body_template == "\n  Hi $name\n\nThanks\n"


@pytest.mark.parametrize("field", ["name", "subject_template", "body_template"])
@pytest.mark.parametrize("blank", ["", "   ", "\n\t "])
@pytest.mark.parametrize("schema", [ReplyTemplateCreateRequest, ReplyTemplateUpdateRequest])
def test_a_blank_field_is_refused(schema: type, field: str, blank: str) -> None:
    with pytest.raises(ValidationError):
        schema(**{**VALID, field: blank})


@pytest.mark.parametrize("subject", ["Re: $listing\nBcc: x@example.com", "Line one\r\nLine two", "Hi\rthere", "Hi\u2028there"])
@pytest.mark.parametrize("schema", [ReplyTemplateCreateRequest, ReplyTemplateUpdateRequest])
def test_a_subject_with_a_line_break_inside_is_refused(schema: type, subject: str) -> None:
    with pytest.raises(ValidationError):
        schema(**{**VALID, "subject_template": subject})


def test_a_trailing_newline_on_the_subject_is_trimmed_not_refused() -> None:
    assert ReplyTemplateCreateRequest(**{**VALID, "subject_template": "Re: $listing\n"}).subject_template == "Re: $listing"


@pytest.mark.parametrize(
    ("field", "limit"),
    [
        ("name", REPLY_TEMPLATE_NAME_MAX_LENGTH),
        ("subject_template", REPLY_TEMPLATE_SUBJECT_MAX_LENGTH),
        ("body_template", REPLY_TEMPLATE_BODY_MAX_LENGTH),
    ],
)
@pytest.mark.parametrize("schema", [ReplyTemplateCreateRequest, ReplyTemplateUpdateRequest])
def test_each_field_holds_its_limit(schema: type, field: str, limit: int) -> None:
    schema(**{**VALID, field: "a" * limit})
    with pytest.raises(ValidationError):
        schema(**{**VALID, field: "a" * (limit + 1)})


def test_an_update_leaves_out_what_it_doesn_t_change() -> None:
    assert ReplyTemplateUpdateRequest(name=" Renamed ").to_update_dict() == {"name": "Renamed"}
    assert ReplyTemplateUpdateRequest(is_archived=False).to_update_dict() == {"is_archived": False}


@pytest.mark.parametrize("field", ["name", "subject_template", "body_template", "display_order", "is_archived"])
def test_an_update_refuses_null_rather_than_clearing_a_field(field: str) -> None:
    with pytest.raises(ValidationError, match=field):
        ReplyTemplateUpdateRequest.model_validate({field: None})
