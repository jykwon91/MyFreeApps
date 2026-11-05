"""The website and phone explain each receipt-send refusal by its code, so a code renamed here would show raw.

Both apps read the code's type and messages from the api-client.
"""
import re
from pathlib import Path

from app.services.leases import receipt_send_error_details

API_CLIENT = Path(__file__).parents[2] / "api-client" / "src"
CODE_TYPE = API_CLIENT / "types" / "lease" / "receipt-send-error-code.ts"
MESSAGES = API_CLIENT / "constants" / "receiptSendErrorMessages.ts"


def _server_codes() -> set[str]:
    return {
        value for name, value in vars(receipt_send_error_details).items()
        if name.isupper() and isinstance(value, str)
    }


def test_every_send_code_is_in_the_api_client_type() -> None:
    codes = _server_codes()
    assert len(codes) == 6
    assert set(re.findall(r'"(\w+)"', CODE_TYPE.read_text())) == codes


def test_every_send_code_has_a_message() -> None:
    block = MESSAGES.read_text().split("RECEIPT_SEND_ERROR_MESSAGES")[1].split("};")[0]
    explained = set(re.findall(r"^\s+(\w+):", block, re.MULTILINE))
    assert explained == _server_codes()
