"""MJH permission dependencies.

MJH does not have a multi-tier user role system in product use today —
the ``Role.ADMIN`` enum value comes from ``platform_shared`` and exists
for parity with MBK, but MJH's admin-only surface area (demo accounts,
invites, user management) is gated on ``is_superuser`` instead. The
operator is the sole superuser; everyone else is a regular user.

Provides:
    - ``current_superuser`` — gate on ``user.is_superuser is True``
    - ``current_admin`` — kept as a back-compat alias resolving to
      ``current_superuser`` so any code still importing the old name
      keeps working without changes
    - ``current_strict_superuser`` — three-check defense-in-depth gate
      (is_superuser + recent JWT auth_time + X-TOTP-Code header) for the
      highest-risk admin endpoints. Wired in PR F1.
"""
from __future__ import annotations

from platform_shared.core.permissions import (
    make_current_superuser,
    make_decode_token_auth_time,
    make_strict_superuser_gate,
)

from app.core.auth import current_active_user
from app.core.config import settings
from app.db.session import get_db
from app.services.user.totp_service import verify_totp_code

current_superuser = make_current_superuser(current_active_user)

# Back-compat alias. Existing code that imports ``current_admin`` keeps
# resolving to the same dependency. New code should import
# ``current_superuser`` directly.
current_admin = current_superuser


# Strict superuser gate (PR F1) — three independent checks for the
# highest-risk admin endpoints (toggle superuser, demo CRUD today; more
# in PR F2). Defense-in-depth: a stolen JWT alone cannot exercise these.
_decode_token_auth_time = make_decode_token_auth_time(secret_key=settings.secret_key)

# 60-min recent-auth window (PR F1). Operator must have logged in in the
# last hour to use the strict-gated endpoints; once an hour has passed,
# the gate emits X-Require-Step-Up: reauth and the frontend redirects to
# /login. The TOTP code requirement (X-TOTP-Code header) is independent
# and applies on every gated request.
current_strict_superuser = make_strict_superuser_gate(
    current_active_user=current_active_user,
    get_db=get_db,
    verify_totp_step_up=verify_totp_code,
    decode_token_auth_time=_decode_token_auth_time,
    max_token_age_seconds=3600,
)
