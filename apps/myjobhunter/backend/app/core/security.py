"""Fernet encryption suite for job_board_credential.encrypted_credentials.

Re-exports platform_shared.core.security.create_fernet_suite configured for
this application's context.
"""
from platform_shared.core.security import FernetSuite, create_fernet_suite

from app.core.config import settings


def get_credential_suite() -> FernetSuite:
    """Return the Fernet suite used to encrypt job board credentials."""
    return create_fernet_suite(
        settings.encryption_key,
        salt=b"myjobhunter-v1",
        info=b"myjobhunter-job-board-credentials",
    )
