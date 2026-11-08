"""Cloudflare Turnstile CAPTCHA verification.

Pure verification helper — apps wire their own secret key (read from their own
config layer) and pass it to ``verify_turnstile_token``. When the secret is
empty (dev/CI mode) the verifier short-circuits to True so local development
does not require a Cloudflare account.
"""
import logging

import httpx

logger = logging.getLogger(__name__)

TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"
TURNSTILE_TIMEOUT_S = 10


async def verify_turnstile_token(
    token: str,
    remote_ip: str | None = None,
    *,
    secret_key: str | None,
    expected_action: str | None = None,
    expected_hostnames: frozenset[str] | None = None,
) -> tuple[bool, list[str]]:
    """Verify a Turnstile token against Cloudflare's siteverify endpoint.

    Returns ``(True, [])`` when ``secret_key`` is empty/None — the no-op dev mode.
    Otherwise POSTs to Cloudflare and returns ``(success, error_codes)`` so
    callers can route on specific codes per rules/check-third-party-error-codes.md.

    ``expected_action`` / ``expected_hostnames`` (both optional, default: ignored)
    bind a token to the widget and site that produced it. A Cloudflare-valid token
    whose ``action`` or ``hostname`` differs fails with the synthetic error code
    ``action-mismatch`` / ``hostname-mismatch`` and is logged at WARNING.
    """
    if not secret_key:
        return True, []

    payload: dict[str, str] = {
        "secret": secret_key,
        "response": token,
    }
    if remote_ip:
        payload["remoteip"] = remote_ip

    async with httpx.AsyncClient(timeout=TURNSTILE_TIMEOUT_S) as client:
        resp = await client.post(TURNSTILE_VERIFY_URL, data=payload)
        result = resp.json()

    success = bool(result.get("success", False))
    error_codes: list[str] = list(result.get("error-codes") or [])

    if success:
        observed_action = result.get("action")
        observed_hostname = result.get("hostname")
        if expected_action is not None and observed_action != expected_action:
            error_codes.append("action-mismatch")
        if expected_hostnames is not None and observed_hostname not in expected_hostnames:
            error_codes.append("hostname-mismatch")
        if error_codes:
            success = False
            logger.warning(
                "Turnstile token rejected: reason=%s expected_action=%s observed_action=%s "
                "expected_hostnames=%s observed_hostname=%s",
                error_codes,
                expected_action,
                observed_action,
                sorted(expected_hostnames) if expected_hostnames is not None else None,
                observed_hostname,
            )
            return success, error_codes

    if not success:
        # WARNING + structured kwargs so Sentry/log aggregator can group by failure reason.
        logger.warning(
            "Turnstile verify failed: codes=%s hostname=%s action=%s",
            error_codes,
            result.get("hostname"),
            result.get("action"),
        )

    return success, error_codes
