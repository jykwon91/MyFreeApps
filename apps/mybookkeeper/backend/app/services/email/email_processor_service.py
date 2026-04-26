"""Email processor service -- thin facade that re-exports from focused sub-modules.

Sub-modules:
  email_discovery_service   -- Gmail discovery
  email_fetch_service       -- download attachment bytes from Gmail
  email_extraction_service  -- Claude extraction, document persistence, sync log finalization
"""

# Re-exports -- callers can continue using existing imports
from app.services.email.email_discovery_service import (  # noqa: F401
    discover_gmail_emails,
)
from app.services.email.email_fetch_service import (  # noqa: F401
    drain_gmail_fetch,
)
from app.services.email.email_extraction_service import (  # noqa: F401
    drain_claude_extraction,
    finalize_sync_log,
)
