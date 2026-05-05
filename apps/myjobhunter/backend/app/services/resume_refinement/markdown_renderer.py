"""Render the parsed resume_upload_jobs.result_parsed_fields into the
constrained markdown subset used as the initial session draft.

Only emits markdown shapes that round-trip cleanly through pandoc to
both DOCX and PDF: headings (`##`), unordered lists (`-`), bold/italic
inline. No tables, footnotes, code blocks, or LaTeX.
"""
from __future__ import annotations

from typing import Any


def render_resume_to_markdown(parsed: dict[str, Any]) -> str:
    """Render a ``result_parsed_fields`` dict to markdown.

    Returned text is the constrained subset that pandoc can convert to
    DOCX/PDF without surprises. Designed to be the *starting* draft
    that the refinement loop will iterate on.

    Args:
        parsed: The dict in the shape produced by ``resume_prompt`` —
            ``{"summary", "headline", "work_history", "education", "skills"}``.

    Returns:
        Markdown string. Empty string if ``parsed`` is empty or None.
    """
    if not parsed:
        return ""

    lines: list[str] = []

    headline = (parsed.get("headline") or "").strip()
    if headline:
        lines.append(f"# {headline}")
        lines.append("")

    summary = (parsed.get("summary") or "").strip()
    if summary:
        lines.append("## Summary")
        lines.append("")
        lines.append(summary)
        lines.append("")

    work_history = parsed.get("work_history") or []
    if work_history:
        lines.append("## Experience")
        lines.append("")
        for role in work_history:
            lines.extend(_render_role(role))
            lines.append("")

    education = parsed.get("education") or []
    if education:
        lines.append("## Education")
        lines.append("")
        for entry in education:
            lines.extend(_render_education(entry))
            lines.append("")

    skills = parsed.get("skills") or []
    if skills:
        lines.append("## Skills")
        lines.append("")
        # Group by category; skills with no category land in "Other".
        groups: dict[str, list[str]] = {}
        for skill in skills:
            name = (skill.get("name") or "").strip()
            if not name:
                continue
            category = (skill.get("category") or "other").strip() or "other"
            groups.setdefault(category, []).append(name)

        for category in (
            "language",
            "framework",
            "tool",
            "platform",
            "soft",
            "other",
        ):
            names = groups.get(category)
            if not names:
                continue
            label = _category_label(category)
            lines.append(f"- **{label}:** {', '.join(names)}")
        lines.append("")

    # Strip a trailing empty line for cleanliness.
    while lines and lines[-1] == "":
        lines.pop()

    return "\n".join(lines)


def _render_role(role: dict[str, Any]) -> list[str]:
    company = (role.get("company") or "").strip()
    title = (role.get("title") or "").strip()
    location = (role.get("location") or "").strip()
    starts_on = (role.get("starts_on") or "").strip()
    ends_on = (role.get("ends_on") or "").strip()
    is_current = bool(role.get("is_current"))

    when = _format_date_range(starts_on, ends_on, is_current)

    head_parts: list[str] = []
    if title:
        head_parts.append(f"**{title}**")
    if company:
        head_parts.append(company)
    head = " — ".join(head_parts) if head_parts else "Role"

    meta_parts: list[str] = []
    if when:
        meta_parts.append(when)
    if location:
        meta_parts.append(location)
    meta = " · ".join(meta_parts)

    out = [f"### {head}"]
    if meta:
        out.append(f"*{meta}*")

    bullets = role.get("bullets") or []
    if bullets:
        out.append("")
        for bullet in bullets:
            text = (bullet or "").strip()
            if text:
                out.append(f"- {text}")

    return out


def _render_education(entry: dict[str, Any]) -> list[str]:
    school = (entry.get("school") or "").strip()
    degree = (entry.get("degree") or "").strip()
    field = (entry.get("field") or "").strip()
    starts_on = (entry.get("starts_on") or "").strip()
    ends_on = (entry.get("ends_on") or "").strip()
    gpa = (entry.get("gpa") or "").strip()

    head_parts: list[str] = []
    if school:
        head_parts.append(f"**{school}**")
    if degree:
        if field:
            head_parts.append(f"{degree} in {field}")
        else:
            head_parts.append(degree)
    elif field:
        head_parts.append(field)

    head = " — ".join(head_parts) if head_parts else "Education entry"

    meta_parts: list[str] = []
    when = _format_date_range(starts_on, ends_on, False)
    if when:
        meta_parts.append(when)
    if gpa:
        meta_parts.append(f"GPA {gpa}")
    meta = " · ".join(meta_parts)

    out = [f"### {head}"]
    if meta:
        out.append(f"*{meta}*")
    return out


def _format_date_range(starts_on: str, ends_on: str, is_current: bool) -> str:
    if not starts_on and not ends_on and not is_current:
        return ""
    if is_current and starts_on:
        return f"{starts_on} – Present"
    if starts_on and ends_on:
        return f"{starts_on} – {ends_on}"
    if starts_on:
        return starts_on
    if ends_on:
        return ends_on
    if is_current:
        return "Present"
    return ""


def _category_label(category: str) -> str:
    return {
        "language": "Languages",
        "framework": "Frameworks",
        "tool": "Tools",
        "platform": "Platforms",
        "soft": "Soft skills",
        "other": "Other",
    }.get(category, category.title())
