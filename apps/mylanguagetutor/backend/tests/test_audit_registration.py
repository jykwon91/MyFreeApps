"""MyLanguageTutor's production lifespan attaches the audit listener with its masking config.

The listener used to read sets that ``app/core/audit.py`` registered as an
import-time side effect. PR #2623 removed the only import of that module from
``app/main.py``, so the listener attached with nothing registered and copied
password hashes and TOTP secrets into ``audit_logs`` in cleartext. This runs
``app.main``'s real lifespan up to the audit step and checks what the listener
attached with.
"""
from __future__ import annotations

import pytest
from platform_shared.testing.audit_wiring import audit_config_attached_by_lifespan

from app.core.audit import AUDIT_CONFIG
from app.main import app


@pytest.mark.asyncio
async def test_lifespan_attaches_the_app_audit_config() -> None:
    attached = await audit_config_attached_by_lifespan(app)

    assert attached == AUDIT_CONFIG
    for field in (
        "hashed_password", "totp_secret", "totp_recovery_codes",
        "learner_text", "reply_text", "corrections_json", "translation_text",
    ):
        assert field in attached.sensitive_fields
    for table in ("auth_events", "refresh_sessions"):
        assert table in attached.skip_tables
