"""FastAPI OpenAPI/docs exposure policy.

Interactive API docs (``/docs``, ``/redoc``) and the raw OpenAPI schema
(``/openapi.json``) enumerate every route, parameter, and schema the backend
exposes. That is a convenience in development and a needless
information-disclosure / attack-surface expansion in production — a probing
attacker gets a machine-readable map of the whole API for free.

Each app spreads the result of :func:`docs_kwargs` into its ``FastAPI(...)``
constructor so the policy is defined once and applied identically everywhere,
rather than each app hand-rolling (and drifting on) the three kwargs.

Disabled in ``production`` only. ``development``/``test``/``staging`` keep the
docs — staging is internal and the docs are useful there for verification.
"""
from __future__ import annotations

from typing import Any


def docs_kwargs(environment: str) -> dict[str, Any]:
    """Return the ``FastAPI`` kwargs that gate docs/schema exposure.

    In production, returns ``docs_url``/``redoc_url``/``openapi_url`` all set
    to ``None`` (disabling Swagger UI, ReDoc, and the raw schema). In every
    other environment, returns an empty dict so FastAPI's defaults apply.
    """
    if environment == "production":
        return {"docs_url": None, "redoc_url": None, "openapi_url": None}
    return {}
