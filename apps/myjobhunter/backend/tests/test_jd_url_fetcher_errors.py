"""Fetch-failure messages name the job link without its query string or login.

They are logged, sent to Sentry and shown to the user, and job links carry
tracking and session tokens.
"""
import pytest
from platform_shared.core.capped_fetch_error import CappedFetchError
from platform_shared.core.capped_fetch_failure_reason import CappedFetchFailureReason

from app.services.extraction.jd_url_fetcher import _jd_fetch_error

_URL = "https://jane:pw@jobs.example.com/posting/42?session=s3cret&utm=x#apply"


@pytest.mark.parametrize(
    ("reason", "status_code"),
    [
        ("timeout", None),
        ("http_status", 503),
        ("too_many_redirects", None),
        ("bad_encoding", None),
        ("network", None),
    ],
)
def test_message_names_the_link_without_its_query(
    reason: CappedFetchFailureReason, status_code: int | None,
) -> None:
    error = _jd_fetch_error(CappedFetchError(reason, host="jobs.example.com", status_code=status_code), _URL)
    message = str(error)
    assert "https://jobs.example.com/posting/42" in message
    for secret in ("s3cret", "utm", "#apply", "jane", "pw@"):
        assert secret not in message
