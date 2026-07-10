"""Boot guard + config-default regression for MINIO_PUBLIC_BASE_URL.

Regression tests for the 2026-07-10 incident: MINIO_PUBLIC_BASE_URL was set to
an unbound custom domain (mga-clips.myfreeapps.org, NXDOMAIN), so every lineup
clip/screenshot dead-linked in the browser while the API and /health stayed
green and the deploy reported success.

Two guardrails locked here:

1. The shipped ``.env.docker.example`` must default MINIO_PUBLIC_BASE_URL to
   EMPTY (presigned prod mode) — the operator copied the old non-empty default,
   which is what caused the incident.
2. ``_check_media_public_base_url_resolvable`` fails loud in production when a
   configured public media host does not resolve, and is a no-op in the default
   presigned mode.
"""
from __future__ import annotations

import socket
from pathlib import Path

import pytest

from app import main
from app.core.config import settings
from app.main import (
    MediaPublicBaseUrlUnresolvableError,
    _check_media_public_base_url_resolvable,
)


def test_empty_base_is_noop(monkeypatch):
    """Presigned mode (empty base): guard does nothing and never resolves DNS."""
    monkeypatch.setattr(settings, "minio_public_base_url", "")

    def _fail(*_a, **_k):
        raise AssertionError("getaddrinfo must not run when base is empty")

    monkeypatch.setattr(main.socket, "getaddrinfo", _fail)
    _check_media_public_base_url_resolvable()  # must not raise


def test_resolvable_host_passes(monkeypatch):
    monkeypatch.setattr(settings, "minio_public_base_url", "https://mga-clips.myfreeapps.org")
    monkeypatch.setattr(settings, "environment", "production")
    monkeypatch.setattr(main.socket, "getaddrinfo", lambda *_a, **_k: [("ok",)])
    _check_media_public_base_url_resolvable()  # must not raise


def test_unresolvable_host_raises_in_production(monkeypatch):
    monkeypatch.setattr(settings, "minio_public_base_url", "https://mga-clips.myfreeapps.org")
    monkeypatch.setattr(settings, "environment", "production")

    def _boom(*_a, **_k):
        raise socket.gaierror("Name or service not known")

    monkeypatch.setattr(main.socket, "getaddrinfo", _boom)
    with pytest.raises(MediaPublicBaseUrlUnresolvableError):
        _check_media_public_base_url_resolvable()


def test_unresolvable_host_warns_but_continues_in_dev(monkeypatch):
    monkeypatch.setattr(settings, "minio_public_base_url", "https://mga-clips.myfreeapps.org")
    monkeypatch.setattr(settings, "environment", "development")

    def _boom(*_a, **_k):
        raise socket.gaierror("Name or service not known")

    monkeypatch.setattr(main.socket, "getaddrinfo", _boom)
    _check_media_public_base_url_resolvable()  # dev: warn, don't crash


def test_base_without_host_raises_regardless_of_env(monkeypatch):
    """A bare hostname (no scheme) is a config error — enforce a full https URL."""
    monkeypatch.setattr(settings, "minio_public_base_url", "mga-clips.myfreeapps.org")
    monkeypatch.setattr(settings, "environment", "development")
    with pytest.raises(MediaPublicBaseUrlUnresolvableError):
        _check_media_public_base_url_resolvable()


def test_env_example_defaults_to_presigned_mode():
    """Root-cause regression: the shipped example must NOT set an unbound custom
    domain. Empty MINIO_PUBLIC_BASE_URL == presigned prod mode (the safe default)."""
    example = Path(__file__).resolve().parent.parent / ".env.docker.example"
    values = [
        line.split("=", 1)[1].strip()
        for line in example.read_text(encoding="utf-8").splitlines()
        if line.startswith("MINIO_PUBLIC_BASE_URL=")
    ]
    assert values, "MINIO_PUBLIC_BASE_URL line missing from .env.docker.example"
    assert values[-1] == "", (
        "MINIO_PUBLIC_BASE_URL must ship EMPTY (presigned mode). A non-empty "
        "unbound custom domain dead-links every clip — the 2026-07-10 incident."
    )
