"""Document kind — canonical union type alias.

Import this wherever a ``kind`` field value is expected so the
allowlist is defined in one place and validated at the Pydantic layer.
"""
from typing import Literal

DocumentKindLiteral = Literal[
    "cover_letter",
    "tailored_resume",
    "job_description",
    "portfolio",
    "other",
]
