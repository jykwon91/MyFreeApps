from dataclasses import dataclass

from google.oauth2.credentials import Credentials

from app.models.integrations.gmail_connection_snapshot import GmailConnectionSnapshot


@dataclass(frozen=True)
class RefreshedGmailToken:
    """Credentials a Gmail call used, to save once its transaction commits."""

    connection: GmailConnectionSnapshot
    creds: Credentials
    prior_token: str | None
