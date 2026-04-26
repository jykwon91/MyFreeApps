import hashlib
from typing import Final

import httpx

HIBP_API_URL: Final = "https://api.pwnedpasswords.com/range/"
HIBP_TIMEOUT_S: Final = 3.0
HIBP_USER_AGENT: Final = "MyBookkeeper-PasswordCheck/1.0"


class HIBPCheckError(Exception):
    """Raised when the HIBP API is unreachable. Caller decides whether to fail-open or fail-closed."""


async def is_password_pwned(password: str, *, threshold: int = 1) -> bool:
    """Return True if the password appears in HIBP's breach corpus at least `threshold` times.

    Uses the k-anonymity range API: only the first 5 hex chars of the SHA-1 hash are
    sent to HIBP, so the plaintext password never leaves the server.

    Raises HIBPCheckError on network failure or non-200 response.
    """
    # lgtm[py/weak-sensitive-data-hashing] — SHA1 is mandated by HIBP's k-anonymity
    # range API protocol (https://haveibeenpwned.com/API/v3#PwnedPasswords). Only
    # the first 5 hex chars of the hash leave this server; the plaintext password
    # is hashed locally for protocol compliance, NOT for password storage. Password
    # storage uses argon2 via pwdlib (see fastapi-users `UserManager`).
    sha1 = hashlib.sha1(password.encode("utf-8")).hexdigest().upper()  # codeql[py/weak-sensitive-data-hashing]
    prefix, suffix = sha1[:5], sha1[5:]
    async with httpx.AsyncClient(timeout=HIBP_TIMEOUT_S) as client:
        try:
            response = await client.get(
                f"{HIBP_API_URL}{prefix}",
                headers={"User-Agent": HIBP_USER_AGENT, "Add-Padding": "true"},
            )
            response.raise_for_status()
        except (httpx.RequestError, httpx.HTTPStatusError) as exc:
            raise HIBPCheckError(f"HIBP API unreachable: {exc}") from exc
        for line in response.text.splitlines():
            hash_suffix, _, count_str = line.partition(":")
            if hash_suffix == suffix:
                try:
                    count = int(count_str)
                except ValueError:
                    continue
                return count >= threshold
        return False
