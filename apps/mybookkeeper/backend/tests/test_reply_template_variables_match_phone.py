"""The phone explains each variable, so it has to know about every one of them."""
import re
from pathlib import Path

from app.core.inquiry_enums import REPLY_TEMPLATE_VARIABLES

PHONE_LIST = Path(__file__).parents[2] / "mobile" / "src" / "constants" / "replyTemplates.ts"


def test_the_phone_explains_every_reply_template_variable() -> None:
    tokens = re.findall(r'token: "(\$\w+)"', PHONE_LIST.read_text())
    assert sorted(tokens) == sorted(REPLY_TEMPLATE_VARIABLES)
