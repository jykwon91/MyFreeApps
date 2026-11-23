"""Every app's audit configuration passes the boot rules, checked from source.

Boot fails (platform_shared.core.audit) when an AuditConfig leaves out the
shared baseline or names a column or table that doesn't exist. This catches
both in CI for every app and the scaffold, without importing the apps.
"""
from __future__ import annotations

from pathlib import Path

import pytest
from fastapi_users.db import SQLAlchemyBaseUserTableUUID

from platform_shared.core.audit_baseline_constants import (
    AUDIT_BASELINE_SENSITIVE_FIELDS,
    AUDIT_BASELINE_SKIP_TABLES,
)
from tests.audit_config_source import (
    audit_config_names,
    model_attribute_names,
    model_table_names,
)

_REPO_ROOT = Path(__file__).resolve().parents[3]
_SHARED = _REPO_ROOT / "packages" / "shared-backend" / "platform_shared"
# Shared models and the column mixins apps' models inherit.
_SHARED_MODEL_DIRS = [_SHARED / "db" / "models", _SHARED / "auth"]
# The fastapi-users columns every user table inherits (hashed_password, email, ...).
_FASTAPI_USERS_COLUMNS = {
    name for cls in SQLAlchemyBaseUserTableUUID.__mro__ for name in getattr(cls, "__annotations__", {})
}

# backend/ directories of every app and the scaffold new apps are rendered from.
_BACKENDS = {
    app: _REPO_ROOT / "apps" / app / "backend"
    for app in (
        "mybookkeeper",
        "myjobhunter",
        "mygamingassistant",
        "mypizzatracker",
        "myrecipes",
        "mylanguagetutor",
    )
} | {"scaffold": _REPO_ROOT / "infra" / "templates" / "scaffold" / "backend"}


def _config_names(backend: Path, suffix: str) -> set[str]:
    return audit_config_names(backend / "app" / "core" / "audit.py", suffix)


def _model_dirs(backend: Path) -> list[Path]:
    return [backend / "app" / "models", *_SHARED_MODEL_DIRS]


def test_every_app_is_listed() -> None:
    apps = {p.name for p in (_REPO_ROOT / "apps").iterdir() if (p / "backend" / "app" / "core" / "audit.py").exists()}
    assert apps <= set(_BACKENDS), f"add {sorted(apps - set(_BACKENDS))} to _BACKENDS"


@pytest.mark.parametrize("name", sorted(_BACKENDS))
class TestAuditConfigPassesTheBootCheck:
    def test_masks_the_shared_baseline(self, name: str) -> None:
        missing = AUDIT_BASELINE_SENSITIVE_FIELDS - _config_names(_BACKENDS[name], "_SENSITIVE_FIELDS")
        assert not missing, f"{name}: add {sorted(missing)} to the sensitive fields in app/core/audit.py"

    def test_skips_the_shared_baseline_tables(self, name: str) -> None:
        missing = AUDIT_BASELINE_SKIP_TABLES - _config_names(_BACKENDS[name], "_SKIP_TABLES")
        assert not missing, f"{name}: add {sorted(missing)} to the skip tables in app/core/audit.py"

    def test_skip_tables_are_real_tables(self, name: str) -> None:
        backend = _BACKENDS[name]
        unknown = _config_names(backend, "_SKIP_TABLES") - model_table_names(_model_dirs(backend))
        assert not unknown, f"{name}: skip tables {sorted(unknown)} match no model's __tablename__"

    def test_skip_fields_are_real_columns(self, name: str) -> None:
        backend = _BACKENDS[name]
        unknown = _config_names(backend, "_SKIP_FIELDS") - model_attribute_names(_model_dirs(backend))
        assert not unknown, f"{name}: skip fields {sorted(unknown)} match no model column"

    def test_sensitive_fields_are_real_columns(self, name: str) -> None:
        backend = _BACKENDS[name]
        known = model_attribute_names(_model_dirs(backend)) | _FASTAPI_USERS_COLUMNS
        unknown = _config_names(backend, "_SENSITIVE_FIELDS") - known
        assert not unknown, f"{name}: sensitive fields {sorted(unknown)} match no model column"


def test_parsers_find_the_names() -> None:
    # Guards the parsers: finding nothing would let every check above pass.
    mbk = _BACKENDS["mybookkeeper"]
    assert {"auth_events", "refresh_sessions", "usage_logs"} <= model_table_names(_model_dirs(mbk))
    assert {"file_content", "totp_secret", "current_secret_hash"} <= model_attribute_names(_model_dirs(mbk))
    assert "hashed_password" in _FASTAPI_USERS_COLUMNS
    assert "file_content" in _config_names(mbk, "_SKIP_FIELDS")
