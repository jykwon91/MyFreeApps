"""The website explains each receipt-send refusal by its code, so a code renamed here would show raw."""
import re
from pathlib import Path

from app.services.leases import receipt_send_error_details

WEBSITE_MESSAGES = Path(__file__).parents[2] / "frontend" / "src" / "shared" / "lib" / "receipt-send-errors.ts"


def test_every_send_code_has_a_website_message() -> None:
    codes = {
        value for name, value in vars(receipt_send_error_details).items()
        if name.isupper() and isinstance(value, str)
    }
    block = WEBSITE_MESSAGES.read_text().split("RECEIPT_SEND_ERROR_MESSAGES")[1].split("};")[0]
    explained = set(re.findall(r"^\s+(\w+):", block, re.MULTILINE))
    assert len(codes) == 6
    assert codes == explained
