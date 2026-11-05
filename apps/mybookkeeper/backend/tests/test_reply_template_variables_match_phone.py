"""The phone explains each variable and holds the same length limits, so it has to match the server."""
import re
from pathlib import Path

import pytest

from app.core.inquiry_enums import REPLY_TEMPLATE_VARIABLES

MOBILE = Path(__file__).parents[2] / "mobile"
PHONE_LIST = MOBILE / "src" / "constants" / "replyTemplates.ts"
SCHEMAS = Path(__file__).parents[1] / "app" / "schemas" / "inquiries"


def test_the_phone_explains_every_reply_template_variable() -> None:
    tokens = re.findall(r'token: "(\$\w+)"', PHONE_LIST.read_text())
    assert sorted(tokens) == sorted(REPLY_TEMPLATE_VARIABLES)


@pytest.mark.parametrize("schema_file", ["reply_template_create_request.py", "reply_template_update_request.py"])
def test_the_phone_holds_the_server_s_length_limits(schema_file: str) -> None:
    phone = PHONE_LIST.read_text()
    schema = (SCHEMAS / schema_file).read_text()
    for field in ("NAME", "SUBJECT", "BODY"):
        server_limit = re.search(rf"^_{field}_MAX = (\d+)$", schema, re.MULTILINE)
        phone_limit = re.search(rf"^export const REPLY_TEMPLATE_{field}_MAX_LENGTH = (\d+);$", phone, re.MULTILINE)
        assert server_limit and phone_limit, f"{field} limit not found"
        assert phone_limit.group(1) == server_limit.group(1)
