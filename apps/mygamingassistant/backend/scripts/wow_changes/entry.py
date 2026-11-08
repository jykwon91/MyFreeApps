"""One row of the Changes vs Classic feed, and how it is written (pure).

The frontend type is ``types/changes/changeEntry.ts``; keep both in step.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

KIND_CHANGED = "changed"
KIND_NEW = "new"
# Where the Forever side comes from (the badge): the game files, or the operator's own client cache.
PROVENANCE_CLIENT = "client"
PROVENANCE_SEEN = "seen"

# A side-by-side line: what it is, Classic's value, Forever's (None = not there).
Row = tuple[str, str | None, str | None]


@dataclass(frozen=True)
class Change:
    key: str
    kind: str
    name: str
    summary: str
    rows: tuple[Row, ...] = ()
    classes: tuple[str, ...] = ()
    # ("item", id) | ("talent", class, talent id) | ("map", uiMapId)
    link: tuple[Any, ...] | None = None
    # ("item", id) | ("file", file data id)
    icon: tuple[Any, ...] | None = None
    provenance: str = PROVENANCE_CLIENT
    seen_on: str | None = None

    def doc(self) -> dict[str, Any]:
        """The JSON object, empty fields left out so the shards stay small."""
        out: dict[str, Any] = {"key": self.key, "kind": self.kind, "name": self.name, "summary": self.summary}
        if self.rows:
            out["rows"] = [list(r) for r in self.rows]
        if self.classes:
            out["classes"] = list(self.classes)
        if self.link:
            out["link"] = list(self.link)
        if self.icon:
            out["icon"] = list(self.icon)
        if self.provenance != PROVENANCE_CLIENT:
            out["provenance"] = self.provenance
        if self.seen_on:
            out["seenOn"] = self.seen_on
        return out
