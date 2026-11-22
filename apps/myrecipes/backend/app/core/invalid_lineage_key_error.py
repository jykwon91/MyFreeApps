"""Raised when a recipe or tweak's ingredients carry lineage keys that can't be trusted."""
from __future__ import annotations


class InvalidLineageKeyError(ValueError):
    """An ingredient's ``lineage_key`` repeats within the request, or isn't one of the base
    version's keys. The route maps it to HTTP 422."""
