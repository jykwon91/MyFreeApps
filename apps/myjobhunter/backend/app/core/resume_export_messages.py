"""What the resume export route says when the converter fails.

The converter's own error carries pandoc's stderr, so it is logged, not sent.
"""
from typing import Final

RESUME_EXPORT_FAILED_MESSAGE: Final = "We couldn't create that file. Please try again in a moment."
