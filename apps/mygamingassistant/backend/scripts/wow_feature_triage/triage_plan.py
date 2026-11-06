"""A triage plan file and its validation.

```json
{
  "patches": [{"story_id": "<uuid>", "set": {"status": "open", "priority": 2}}],
  "merges": [{"story_id": "<uuid>", "into": "<uuid>"}],
  "mark_triaged": ["<submission uuid>"]
}
```

``set`` is validated with the API's own ``TriageStoryPatch`` schema, so the
preview rejects exactly what the server would. Applied in order: patches,
then merges, then mark-triaged.
"""
from __future__ import annotations

import json
import uuid
from pathlib import Path

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from scripts.wow_feature_triage.plan_merge import PlanMerge
from scripts.wow_feature_triage.plan_patch import PlanPatch


class TriagePlan(BaseModel):
    model_config = ConfigDict(extra="forbid")

    patches: list[PlanPatch] = Field(default_factory=list)
    merges: list[PlanMerge] = Field(default_factory=list)
    mark_triaged: list[uuid.UUID] = Field(default_factory=list)

    def is_empty(self) -> bool:
        return not (self.patches or self.merges or self.mark_triaged)


def load_plan(path: Path) -> TriagePlan:
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise SystemExit(f"Can't read plan {path}: {exc}") from exc
    try:
        return TriagePlan.model_validate(raw)
    except ValidationError as exc:
        raise SystemExit(f"Invalid plan {path}:\n{exc}") from exc
