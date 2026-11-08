"""The "since last build" stamp on each feed row (pure).

Each row carries ``since``: the client build its current content first
appeared in. It's worked out from the files the previous run wrote, before
they're overwritten:

* no previous run → no previous build, every ``since`` is null (the page
  hides the toggle until the next refresh);
* a new build → the old build is the previous one; a row whose content is
  unchanged keeps its old ``since``, a new or changed row gets this build;
* the same build again → the previous build stays what it was, and rows are
  stamped the same way (a row that changed on this re-run gets this build).
"""
from __future__ import annotations

from collections.abc import Iterable, Mapping
from typing import Any

Doc = dict[str, Any]
SINCE = "since"


def previous_build(previous_index: Mapping[str, Any] | None, build: str) -> str | None:
    if previous_index is None:
        return None
    if previous_index.get("build") == build:
        return previous_index.get("previousBuild")
    return previous_index.get("build")


def _content(doc: Mapping[str, Any]) -> Doc:
    return {k: v for k, v in doc.items() if k != SINCE}


def stamp(
    docs: Iterable[Doc],
    previous: Mapping[str, Mapping[str, Any]] | None,
    build: str,
) -> list[Doc]:
    """``docs`` with ``since`` set; ``previous`` = the last run's rows by key, None on a first run."""
    out = []
    for doc in docs:
        if previous is None:
            out.append({**doc, SINCE: None})
            continue
        before = previous.get(doc["key"])
        unchanged = before is not None and _content(before) == _content(doc)
        out.append({**doc, SINCE: before.get(SINCE) if unchanged and before is not None else build})
    return out
