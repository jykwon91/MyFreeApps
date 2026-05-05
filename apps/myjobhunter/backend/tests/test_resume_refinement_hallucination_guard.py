"""Tests for the hallucination guard that catches AI proposals introducing
facts not present in the source resume.

Pure function tests — no DB, no fixtures.
"""
from app.services.resume_refinement.hallucination_guard import check_proposal


SOURCE = """\
# Jane Doe — Senior Software Engineer

## Experience

### **Staff Engineer** — Acme Corp
*2020-01 – Present · San Francisco, CA*

- Built distributed payment processing system
- Led migration to microservices

### **Senior Engineer** — Globex Industries
*2018-03 – 2020-01*

- Owned the search relevance pipeline
"""


def test_pass_when_proposal_only_uses_source_facts():
    proposal = "Architected the payment processing system at Acme Corp"
    assert check_proposal(proposed=proposal, source=SOURCE) == []


def test_flags_invented_company():
    proposal = "Built the system at Hooli, a fictional startup"
    flagged = check_proposal(proposed=proposal, source=SOURCE)
    assert any("Hooli" in item for item in flagged)


def test_flags_invented_year():
    proposal = "Joined the team in 1999 as a founding engineer"
    flagged = check_proposal(proposed=proposal, source=SOURCE)
    assert any("1999" in item for item in flagged)


def test_flags_invented_metric():
    proposal = "Improved throughput by 87% across the fleet"
    flagged = check_proposal(proposed=proposal, source=SOURCE)
    assert any("87%" in item or "%" in item for item in flagged)


def test_flags_invented_dollar_amount():
    proposal = "Saved the team $250K annually through better caching"
    flagged = check_proposal(proposed=proposal, source=SOURCE)
    assert any("$" in item for item in flagged)


def test_does_not_flag_year_present_in_source():
    proposal = "From 2020 to today, owned the migration effort"
    flagged = check_proposal(proposed=proposal, source=SOURCE)
    # 2020 is in SOURCE (2020-01), so the bare year shouldn't be flagged.
    # The token "2020" should match because source contains "2020" as substring.
    assert not any(item == "2020" for item in flagged)


def test_does_not_flag_common_verbs_or_articles():
    proposal = "Built and led the system over time"
    flagged = check_proposal(proposed=proposal, source=SOURCE)
    # Stop-word phrases like "Built" and "Led" should not surface.
    assert flagged == []


def test_flags_invented_proper_noun_phrase():
    proposal = "Won the Forrester Innovation Award in 2021 for the work"
    flagged = check_proposal(proposed=proposal, source=SOURCE)
    # "Forrester Innovation Award" is not in source.
    assert any("Forrester" in item for item in flagged)
