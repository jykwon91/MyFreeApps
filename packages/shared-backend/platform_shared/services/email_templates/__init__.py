"""Shared HTML email template builders.

Per-app branding (color, name, tagline, footer) is injected via a
:class:`Branding` dataclass; the templates themselves stay neutral so MBK,
MJH, and any future app reuse them without copy-paste.

Pure functions: no app config, no env reads, no DB. Output is an HTML
string. The caller picks how to send (raise on failure, return bool, etc.).
"""
from .branding import Branding
from .password_reset import build_password_reset_html
from .verification import build_verification_html

__all__ = [
    "Branding",
    "build_password_reset_html",
    "build_verification_html",
]
