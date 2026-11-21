"""Network tuning for the SMTP client built in ``platform_shared.services.email_service``.

``smtplib.SMTP`` has no timeout by default, so an SMTP server that accepts the
TCP connection and then stalls (on the greeting, STARTTLS, AUTH or DATA) can
block the sending thread forever.
"""
from __future__ import annotations

from typing import Final

# Seconds each socket operation (connect, and every read/write after it) may
# wait. A cap on silence, not on the whole send: a large attachment still goes
# through while bytes keep moving.
SMTP_TIMEOUT_SECONDS: Final = 20.0
