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


def test_flags_multiword_proper_noun_without_connector():
    """Consecutive capitalized words form one checkable phrase even with
    no joining word — 'Initech Solutions' is an invented employer."""
    proposal = "Scaled the platform during my time at Initech Solutions"
    flagged = check_proposal(proposed=proposal, source=SOURCE)
    assert any("Initech" in item for item in flagged)


def test_flags_invented_magnitude_metric():
    """Bare magnitude counts (500K, 1.2M) are quantitative claims."""
    proposal = "Processed 500K transactions per day"
    flagged = check_proposal(proposed=proposal, source=SOURCE)
    assert any("500K" in item for item in flagged)


# ---------------------------------------------------------------------------
# Connector decomposition — regression for the production clarify dead-end.
# The old pattern merged "API" + "React" (both individually in the source)
# into one contiguous phrase "API and React" that wasn't, so it flagged.
# ---------------------------------------------------------------------------


def test_and_joined_words_individually_present_pass():
    source = SOURCE + "\n- Built REST API integrations\n- React frontend work\n"
    proposal = "Delivered API and React integrations for the payment system"
    assert check_proposal(proposed=proposal, source=source) == []


def test_and_joined_decomposition_flags_only_the_missing_part():
    proposal = "Led projects at Acme Corp and Hooli Inc simultaneously"
    flagged = check_proposal(proposed=proposal, source=SOURCE)
    # "Acme Corp" is in source — only the invented "Hooli Inc" flags.
    assert any("Hooli" in item for item in flagged)
    assert not any("Acme" in item for item in flagged)


def test_of_connector_phrase_stays_whole():
    """'of' joins a single name — decomposing 'Bank of America' into
    single tokens would erase the guard for invented employers."""
    proposal = "Managed integrations with Bank of America"
    flagged = check_proposal(proposed=proposal, source=SOURCE)
    assert any("Bank of America" in item for item in flagged)


# ---------------------------------------------------------------------------
# Confirmed-facts allowlist — user confirmation must actually unblock.
# ---------------------------------------------------------------------------


def test_confirmed_metric_is_not_reflagged():
    proposal = "Improved throughput by 87% across the fleet"
    assert any(
        "87%" in item
        for item in check_proposal(proposed=proposal, source=SOURCE)
    )
    assert (
        check_proposal(
            proposed=proposal, source=SOURCE, confirmed_facts=["87%"],
        )
        == []
    )


def test_confirmed_proper_noun_is_not_reflagged_case_insensitive():
    proposal = "Built the system at Hooli after the merger"
    assert any(
        "Hooli" in item
        for item in check_proposal(proposed=proposal, source=SOURCE)
    )
    assert (
        check_proposal(
            proposed=proposal, source=SOURCE, confirmed_facts=["hooli"],
        )
        == []
    )


def test_confirmed_date_is_not_reflagged():
    proposal = "Joined the team in 1999 as a founding engineer"
    assert (
        check_proposal(
            proposed=proposal, source=SOURCE, confirmed_facts=["1999"],
        )
        == []
    )


def test_unconfirmed_facts_still_flag_alongside_confirmed():
    proposal = "Improved throughput by 87% and saved $250K at Hooli"
    flagged = check_proposal(
        proposed=proposal, source=SOURCE, confirmed_facts=["87%"],
    )
    assert not any("87%" in item for item in flagged)
    assert any("$250K" in item for item in flagged)
    assert any("Hooli" in item for item in flagged)


# ---------------------------------------------------------------------------
# Sentence-position heuristics.
# ---------------------------------------------------------------------------


def test_sentence_initial_single_cap_is_not_flagged():
    """A bullet opening with an unlisted verb is ordinary capitalization."""
    proposal = "Spearheaded the search relevance pipeline"
    assert check_proposal(proposed=proposal, source=SOURCE) == []


def test_mid_sentence_single_cap_invented_company_flags():
    proposal = "Shipped the payments integration for Vandelay last quarter"
    flagged = check_proposal(proposed=proposal, source=SOURCE)
    assert any("Vandelay" in item for item in flagged)
