"""The website and phone tell reply-send outcomes apart by these codes, so a code renamed here would read as a plain failure."""
import re
from pathlib import Path

from app.services.inquiries import reply_send_error_details

DETAILS = Path(__file__).parents[2] / "api-client" / "src" / "constants" / "replySendDetails.ts"


def test_api_client_has_the_same_reply_send_codes() -> None:
    server = {
        name: value for name, value in vars(reply_send_error_details).items()
        if name.isupper() and isinstance(value, str)
    }
    client = dict(re.findall(r'export const (\w+) = "(\w+)";', DETAILS.read_text()))
    assert len(server) == 7
    assert client == server
