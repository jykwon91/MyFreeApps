"""The phone tells these refusals apart by their words, so a rewording here would break it quietly."""
import re
from pathlib import Path

PHONE_CONSTANTS = Path(__file__).parents[2] / "mobile" / "src" / "constants" / "paymentReview.ts"
SERVICE = Path(__file__).parents[1] / "app" / "services" / "transactions" / "attribution_service.py"


def test_the_server_still_says_what_the_phone_listens_for() -> None:
    block = PHONE_CONSTANTS.read_text().split("PAYMENT_REVIEW_SERVER_DETAILS = {")[1].split("}")[0]
    details = re.findall(r': "([^"]+)"', block)
    assert len(details) == 4
    service = SERVICE.read_text()
    assert [detail for detail in details if f'"{detail}"' not in service] == []
