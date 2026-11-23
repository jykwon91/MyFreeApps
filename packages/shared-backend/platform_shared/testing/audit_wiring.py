"""Test helper: which audit configuration does an app's real lifespan attach?"""
from __future__ import annotations

from typing import Any
from unittest.mock import patch

from fastapi import FastAPI

from platform_shared.core import lifespan as lifespan_module
from platform_shared.core.audit import (
    attached_audit_config,
    register_audit_listeners,
    reset_registry,
)
from platform_shared.core.audit_config import AuditConfig


class _BootStoppedAfterAudit(Exception):
    """Raised right after the audit listener attaches, so the rest of boot
    (bucket check, seeding, workers) never runs in a unit test."""


async def audit_config_attached_by_lifespan(app: FastAPI) -> AuditConfig:
    """Run ``app``'s production lifespan up to and including the audit step.

    The real ``register_audit_listeners`` runs with whatever configuration the
    lifespan hands it (including its verification against the mapped models),
    then boot stops. Returns the configuration the listener attached with.
    The listener is detached before and after, so no test inherits it.
    """

    def _attach_then_stop(config: AuditConfig, **kwargs: Any) -> None:
        register_audit_listeners(config, **kwargs)
        raise _BootStoppedAfterAudit

    reset_registry()
    try:
        with patch.object(lifespan_module, "register_audit_listeners", _attach_then_stop):
            try:
                async with app.router.lifespan_context(app):
                    pass
            except _BootStoppedAfterAudit:
                pass
            else:
                raise AssertionError("the lifespan finished without attaching the audit listener")
        config = attached_audit_config()
        assert config is not None, "the lifespan did not attach the audit listener"
        return config
    finally:
        reset_registry()
