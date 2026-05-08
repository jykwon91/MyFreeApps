"""Per-app branding parameters injected into shared email templates."""
from dataclasses import dataclass


@dataclass(frozen=True)
class Branding:
    """Visual + copy parameters consumed by shared email-template builders.

    Each app instantiates one of these (typically as a module-level
    constant in ``app/core/branding.py``) and passes it to the relevant
    builder. The shared template renders the same structural HTML for
    every app; only the brand strings/colour vary.
    """

    app_name: str
    """Brand name shown in the header, body greeting, and footer."""

    accent_color: str
    """CSS hex color used for the header background and CTA button."""

    tagline: str
    """One-line tagline rendered below the brand name in the header."""

    header_prefix_html: str = ""
    """Optional HTML/entity prefix before the brand name in the header.

    The string is inserted verbatim (NOT escaped) so callers can include
    HTML entities like ``&#x1F4D2;`` for an emoji glyph. Keep this
    constant — never derive from user input.
    """

    footer_suffix: str = ""
    """Optional text appended to the footer after the brand name with
    a bullet separator (e.g. ``"AI-powered bookkeeping"`` →
    ``"Sent by MyBookkeeper • AI-powered bookkeeping"``). HTML-escaped at
    render time."""
