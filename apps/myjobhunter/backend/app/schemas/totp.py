"""Pydantic request/response schemas for the TOTP endpoints.

The frontend's RTK Query slice consumes these shapes verbatim — keep them
narrow and well-typed. ``totp_code`` is up to 8 chars to accept both
6-digit TOTP codes and 8-char alphanumeric recovery codes; the backend
dispatches between the two based on which validator matches.
"""
from pydantic import BaseModel, Field


class TotpSetupResponse(BaseModel):
    """Returned from ``POST /auth/totp/setup``.

    The plaintext secret + provisioning URI are shown to the user in the
    enrollment UI (manual-entry fallback + QR code). Recovery codes are
    surfaced once at enrollment and never re-displayed — the user must save
    them or they're lost.
    """
    secret: str
    provisioning_uri: str
    recovery_codes: list[str]


class TotpVerifyRequest(BaseModel):
    """6-digit TOTP code, RFC 6238 numeric format."""
    code: str = Field(min_length=6, max_length=6, pattern=r"^\d{6}$")


class TotpVerifyResponse(BaseModel):
    verified: bool


class TotpDisableRequest(BaseModel):
    """6-digit TOTP code — NOT a password. Disabling requires proof of possession
    of the authenticator device, not just knowledge of the password."""
    code: str = Field(min_length=6, max_length=6, pattern=r"^\d{6}$")


class TotpDisableResponse(BaseModel):
    disabled: bool


class TotpStatusResponse(BaseModel):
    enabled: bool


class TotpLoginRequest(BaseModel):
    """Unified login payload — supports both first-step (no totp_code) and
    second-step (with totp_code) submissions.

    ``totp_code`` is up to 8 chars: a 6-digit TOTP from the authenticator app,
    or an 8-char alphanumeric recovery code. The backend tries TOTP first,
    falls through to recovery on TOTP failure.
    """
    email: str
    password: str
    totp_code: str | None = Field(default=None, min_length=6, max_length=8)


class TotpLoginResponse(BaseModel):
    """Discriminated by which fields are populated.

    Step 1 (TOTP-enabled user, no code yet):
        ``{"detail": "totp_required"}``
    Step 2 / non-TOTP user (success):
        ``{"access_token": "<jwt>", "token_type": "bearer"}``

    The frontend pivots on ``detail == "totp_required"`` to show the TOTP
    challenge step. Don't paraphrase that string — it's a wire-format contract.
    """
    detail: str | None = None
    access_token: str | None = None
    token_type: str | None = None
