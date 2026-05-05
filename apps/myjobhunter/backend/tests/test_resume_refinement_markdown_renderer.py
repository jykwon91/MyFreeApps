"""Tests for the markdown renderer that builds the initial session draft.

Pure function tests — no DB, no fixtures.
"""
from app.services.resume_refinement.markdown_renderer import (
    render_resume_to_markdown,
)


def test_empty_input_returns_empty_string():
    assert render_resume_to_markdown({}) == ""
    assert render_resume_to_markdown(None) == ""  # type: ignore[arg-type]


def test_renders_headline_and_summary():
    parsed = {
        "headline": "Senior Software Engineer",
        "summary": "10 years of backend experience.",
    }
    out = render_resume_to_markdown(parsed)
    assert "# Senior Software Engineer" in out
    assert "## Summary" in out
    assert "10 years of backend experience." in out


def test_renders_work_history_with_role_heading_and_bullets():
    parsed = {
        "work_history": [
            {
                "company": "Acme",
                "title": "Staff Engineer",
                "location": "San Francisco, CA",
                "starts_on": "2020-01",
                "ends_on": None,
                "is_current": True,
                "bullets": ["Built the X system", "Led the Y migration"],
            },
        ],
    }
    out = render_resume_to_markdown(parsed)
    assert "## Experience" in out
    assert "### **Staff Engineer** — Acme" in out
    assert "2020-01 – Present" in out
    assert "San Francisco, CA" in out
    assert "- Built the X system" in out
    assert "- Led the Y migration" in out


def test_renders_education_with_degree_and_gpa():
    parsed = {
        "education": [
            {
                "school": "Stanford University",
                "degree": "B.S.",
                "field": "Computer Science",
                "starts_on": "2014-09",
                "ends_on": "2018-06",
                "gpa": "3.8",
            },
        ],
    }
    out = render_resume_to_markdown(parsed)
    assert "## Education" in out
    assert "Stanford University" in out
    assert "B.S. in Computer Science" in out
    assert "GPA 3.8" in out


def test_renders_skills_grouped_by_category():
    parsed = {
        "skills": [
            {"name": "Python", "category": "language"},
            {"name": "Django", "category": "framework"},
            {"name": "Docker", "category": "tool"},
            {"name": "Leadership", "category": "soft"},
            {"name": "MongoDB", "category": None},
        ],
    }
    out = render_resume_to_markdown(parsed)
    assert "## Skills" in out
    assert "**Languages:** Python" in out
    assert "**Frameworks:** Django" in out
    assert "**Tools:** Docker" in out
    assert "**Soft skills:** Leadership" in out
    # Skills with None category fall into "Other".
    assert "**Other:** MongoDB" in out


def test_skips_blank_company_and_title():
    parsed = {
        "work_history": [
            {
                "company": "",
                "title": "",
                "bullets": ["Did stuff"],
            }
        ],
    }
    out = render_resume_to_markdown(parsed)
    # Heading falls back to "Role" but bullet still renders.
    assert "### Role" in out
    assert "- Did stuff" in out


def test_uses_constrained_subset_only():
    """Output uses only headings, lists, bold, italic — no tables / footnotes / code."""
    parsed = {
        "headline": "Engineer",
        "work_history": [
            {
                "company": "X",
                "title": "Y",
                "starts_on": "2020-01",
                "ends_on": "2022-12",
                "is_current": False,
                "bullets": ["a", "b"],
            }
        ],
    }
    out = render_resume_to_markdown(parsed)
    # No tables, no code fences, no footnotes, no images.
    assert "|" not in out  # No table separators
    assert "```" not in out
    assert "[^" not in out
    assert "![" not in out
