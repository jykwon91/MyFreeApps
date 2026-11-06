from dataclasses import dataclass

from app.models.email.email_types import DiscoverResult
from app.models.email.refreshed_gmail_token import RefreshedGmailToken


@dataclass(frozen=True)
class DiscoveryOutcome:
    """A finished discovery, and the token to save once its transaction commits."""

    result: DiscoverResult
    token: RefreshedGmailToken | None = None
