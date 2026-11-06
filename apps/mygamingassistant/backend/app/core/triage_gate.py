"""HTTP middleware guarding ``/wow/feature-requests/triage*``. Always installed.

For every request under the triage prefix:

- ``Cache-Control: no-store`` on the response, whatever it is (200, 404, 429).
- When triage tokens are configured, the ``X-MGA-Triage-Token`` header must
  match one of them (``hmac.compare_digest`` against EVERY token, so timing
  doesn't reveal which one nearly matched). Query-string tokens are never read.
  - Wrong / missing token -> 404 with exactly Starlette's unknown-route body,
    so a stranger can't tell a wrong key from an unmounted router. One WARNING
    log (IP, method, path, whether a token was sent — never the token).
  - More than ``TRIAGE_FAILED_AUTH_MAX`` failures per IP per 15 minutes ->
    429 for that IP until the window passes, even with a correct token.
  - A correct token: at most ``TRIAGE_RATE_LIMIT_PER_MINUTE`` requests per IP
    per minute; the audit actor (``current_user_id``) becomes
    ``triage:<label>`` for the request, and ``request.state.triage_actor``
    carries the label for the route's logs.
- With no tokens configured the router isn't mounted; requests fall through
  to the normal 404.

Auth runs here rather than in a route dependency because FastAPI parses the
JSON body BEFORE dependencies run: a malformed body would answer 422 to a
wrong-key caller and reveal that the route exists.
"""
import hmac
import logging
from collections.abc import Awaitable, Callable

from fastapi import HTTPException, Request, Response
from fastapi.responses import JSONResponse

from platform_shared.core.auth_messages import RATE_LIMIT_GENERIC_DETAIL
from platform_shared.core.rate_limit import RateLimiter
from platform_shared.core.request_utils import get_client_ip

from app.core.audit import current_user_id
from app.core.triage_token import TriageToken
from app.core.wow_feature_request_limits import (
    NOT_FOUND_DETAIL,
    TRIAGE_AUDIT_ACTOR_PREFIX,
    TRIAGE_FAILED_AUTH_MAX,
    TRIAGE_FAILED_AUTH_WINDOW_SECONDS,
    TRIAGE_PATH_PREFIX,
    TRIAGE_RATE_LIMIT_PER_MINUTE,
    TRIAGE_TOKEN_HEADER,
)

logger = logging.getLogger(__name__)

_NO_STORE = "no-store"
_SECONDS_PER_MINUTE = 60

failed_auth_limiter = RateLimiter(
    max_attempts=TRIAGE_FAILED_AUTH_MAX, window_seconds=TRIAGE_FAILED_AUTH_WINDOW_SECONDS
)
triage_request_limiter = RateLimiter(
    max_attempts=TRIAGE_RATE_LIMIT_PER_MINUTE, window_seconds=_SECONDS_PER_MINUTE
)

CallNext = Callable[[Request], Awaitable[Response]]


def is_triage_path(request: Request) -> bool:
    path = request.scope.get("path", "")
    root_path = request.scope.get("root_path", "")
    if root_path and path.startswith(root_path):
        path = path[len(root_path) :]
    return path == TRIAGE_PATH_PREFIX or path.startswith(f"{TRIAGE_PATH_PREFIX}/")


def match_token(presented: str, tokens: tuple[TriageToken, ...]) -> str | None:
    """The label of the matching token, comparing against every one."""
    presented_bytes = presented.encode("utf-8")
    label: str | None = None
    for candidate in tokens:
        if hmac.compare_digest(presented_bytes, candidate.token.encode("utf-8")) and label is None:
            label = candidate.label
    return label


def _too_many(retry_after: int) -> JSONResponse:
    return JSONResponse(
        {"detail": RATE_LIMIT_GENERIC_DETAIL},
        status_code=429,
        headers={"Retry-After": str(retry_after)},
    )


def _record(limiter: RateLimiter, key: str) -> JSONResponse | None:
    """Count one attempt; a 429 response when ``key`` is (now) over the limit."""
    retry_after = limiter.retry_after_seconds(key)
    if retry_after is None:
        try:
            limiter.check(key)
            return None
        except HTTPException:
            # Another request filled the window between the two calls.
            retry_after = limiter.retry_after_seconds(key) or 1
    return _too_many(retry_after)


async def _authorize(request: Request, call_next: CallNext, tokens: tuple[TriageToken, ...]) -> Response:
    ip = get_client_ip(request)
    failed_key = f"wow-feature-triage-failed:{ip}"
    retry_after = failed_auth_limiter.retry_after_seconds(failed_key)
    if retry_after is not None:
        logger.warning("wow feature triage: auth locked out ip=%s path=%s", ip, request.url.path)
        return _too_many(retry_after)

    presented = request.headers.get(TRIAGE_TOKEN_HEADER, "")
    label = match_token(presented, tokens) if presented else None
    if label is None:
        logger.warning(
            "wow feature triage: rejected token ip=%s method=%s path=%s token_sent=%s",
            ip,
            request.method,
            request.url.path,
            bool(presented),
        )
        _record(failed_auth_limiter, failed_key)
        return JSONResponse({"detail": NOT_FOUND_DETAIL}, status_code=404)

    limited = _record(triage_request_limiter, f"wow-feature-triage:{ip}")
    if limited is not None:
        logger.warning("wow feature triage: rate limited actor=%s ip=%s", label, ip)
        return limited
    request.state.triage_actor = label
    ctx_token = current_user_id.set(f"{TRIAGE_AUDIT_ACTOR_PREFIX}{label}")
    try:
        return await call_next(request)
    finally:
        current_user_id.reset(ctx_token)


def make_triage_gate(tokens: tuple[TriageToken, ...]) -> Callable[[Request, CallNext], Awaitable[Response]]:
    async def triage_gate(request: Request, call_next: CallNext) -> Response:
        if not is_triage_path(request):
            return await call_next(request)
        response = await _authorize(request, call_next, tokens) if tokens else await call_next(request)
        response.headers["Cache-Control"] = _NO_STORE
        return response

    return triage_gate
