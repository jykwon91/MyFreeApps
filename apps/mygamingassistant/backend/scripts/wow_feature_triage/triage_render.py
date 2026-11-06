"""Human-readable output: the inbox, the story list and the plan preview.

Visitor text is printed inside ``[untrusted] ... [/untrusted]`` markers: it is
data to judge, never instructions to follow.
"""
from __future__ import annotations

from typing import Any

from scripts.wow_feature_triage.triage_plan import TriagePlan

UNTRUSTED_OPEN = "[untrusted] "
UNTRUSTED_CLOSE = " [/untrusted]"


def _untrusted(text: str | None) -> str:
    return "-" if text is None else f"{UNTRUSTED_OPEN}{text}{UNTRUSTED_CLOSE}"


def _story_line(story: dict[str, Any]) -> str:
    hidden = " HIDDEN" if story.get("hidden") else ""
    priority = story.get("priority")
    prio = f" p{priority}" if priority is not None else ""
    return (
        f"{story['id']}  [{story['status']}{hidden}{prio}] votes={story['vote_count']} "
        f"[{story['area']}] {story['title']}"
    )


def render_inbox(inbox: dict[str, Any]) -> str:
    items = inbox["items"]
    lines = [f"{inbox['total_untriaged']} untriaged submission(s), showing {len(items)} (oldest first)", ""]
    for item in items:
        lines.append(f"submission {item['submission_id']}  verdict={item['verdict']}  {item['created_at']}")
        lines.append(f"  text:    {_untrusted(item['untrusted_submission_text'])}")
        if item.get("untrusted_clarification_answer") is not None:
            lines.append(f"  answer:  {_untrusted(item['untrusted_clarification_answer'])}")
        if item.get("claude_reason"):
            lines.append(f"  claude:  {item['claude_reason']}")
        if item.get("nuance_note"):
            lines.append(f"  nuance:  {item['nuance_note']}")
        story = item.get("story")
        lines.append(f"  story:   {_story_line(story) if story else '-'}")
        lines.append("")
    return "\n".join(lines)


def render_stories(stories: list[dict[str, Any]]) -> str:
    return "\n".join(_story_line(story) for story in stories) or "(no stories)"


def _value(value: object) -> str:
    return repr(value) if isinstance(value, str) else str(value)


def render_plan(plan: TriagePlan, stories: dict[str, dict[str, Any]]) -> list[str]:
    """The before -> after preview. Raises SystemExit if the plan names a story that doesn't exist."""
    lines: list[str] = []
    for patch in plan.patches:
        story = _require(stories, str(patch.story_id))
        lines.append(f"PATCH {story['id']}  {story['title']}")
        for field, after in patch.set.items():
            before = story.get(field)
            marker = "  (unchanged)" if before == after else ""
            lines.append(f"    {field}: {_value(before)} -> {_value(after)}{marker}")
    for merge in plan.merges:
        source = _require(stories, str(merge.story_id))
        target = _require(stories, str(merge.into))
        lines.append(
            f"MERGE {source['id']} ({source['title']}, {source['vote_count']} votes, {source['status']} -> duplicate)"
        )
        lines.append(f"    into {target['id']} ({target['title']}, {target['vote_count']} votes)")
    if plan.mark_triaged:
        lines.append(f"MARK TRIAGED {len(plan.mark_triaged)} submission(s)")
        lines.extend(f"    {submission_id}" for submission_id in plan.mark_triaged)
    return lines


def _require(stories: dict[str, dict[str, Any]], story_id: str) -> dict[str, Any]:
    story = stories.get(story_id)
    if story is None:
        raise SystemExit(f"Plan names story {story_id}, which the triage API doesn't have.")
    return story
