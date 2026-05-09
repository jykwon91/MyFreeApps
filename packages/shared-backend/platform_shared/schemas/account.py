"""Request schemas for the account self-service endpoints.

Lives in ``platform_shared`` so MBK + MJH (and future apps) share the
exact same wire-shape contract for ``DELETE /users/me``. Account
deletion is the highest-impact write op in the system; drift between
apps in the request shape would be a real bug.
"""
from pydantic import BaseModel, Field


class DeleteAccountRequest(BaseModel):
    """Body of ``DELETE /users/me``.

    Three-factor confirmation:
    - ``password`` is re-verified against the stored hash
    - ``confirm_email`` must match the authenticated user's email (case-insensitive)
    - ``totp_code`` is required only when the user has 2FA enabled

    The minimum length on ``totp_code`` is 6 (a standard 6-digit RFC 6238 code)
    and the max is 8 to allow recovery codes to be used as a fallback.
    """

    password: str = Field(min_length=1)
    confirm_email: str = Field(min_length=1)
    totp_code: str | None = Field(default=None, min_length=6, max_length=8)
