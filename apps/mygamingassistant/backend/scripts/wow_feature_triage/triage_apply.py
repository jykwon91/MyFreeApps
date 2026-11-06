"""Apply a triage plan: patches, then merges, then mark-triaged.

Each write sends the story's current ``updated_at`` as ``If-Match``. A write's
response carries the story's new version, so a story patched and then merged
in the same plan still passes the check. The first failing step stops the run;
everything before it has been applied (each step is its own transaction).
"""
from __future__ import annotations

from collections.abc import Callable
from typing import Any

from scripts.wow_feature_triage.triage_client import TriageClient
from scripts.wow_feature_triage.triage_plan import TriagePlan

Echo = Callable[[str], None]


def apply_plan(client: TriageClient, plan: TriagePlan, stories: dict[str, dict[str, Any]], echo: Echo) -> None:
    versions = {story_id: story["updated_at"] for story_id, story in stories.items()}

    for patch in plan.patches:
        story_id = str(patch.story_id)
        updated = client.patch(story_id, patch.set, version=versions[story_id])
        versions[story_id] = updated["updated_at"]
        echo(f"patched {story_id} -> status={updated['status']}")

    for merge in plan.merges:
        source_id, target_id = str(merge.story_id), str(merge.into)
        result = client.merge(source_id, target_id, version=versions[source_id])
        versions[source_id] = result["source"]["updated_at"]
        versions[target_id] = result["target"]["updated_at"]
        echo(f"merged {source_id} into {target_id} -> {result['target']['vote_count']} votes")

    if plan.mark_triaged:
        result = client.mark_triaged([str(submission_id) for submission_id in plan.mark_triaged])
        echo(f"marked {result['marked']} of {len(plan.mark_triaged)} submission(s) triaged")
