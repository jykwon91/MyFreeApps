"""Tests for the parse-time provenance guard.

The parse path seeds all profile data but had NO validation of Claude's
output — a fabricated "40%" metric shipped into work_history.bullets
unnoticed (operator report, 2026-07-02). ``build_parse_provenance``
checks every extracted bullet + the summary against the source text and
returns per-bullet verdicts. Pure function tests — no DB, no network.
"""
from app.services.jobs.parse_provenance import build_parse_provenance


SOURCE = """\
Jane Doe — Senior Software Engineer

OneOncology — Software Engineer (2022-11 to Present)
- Built internal reporting dashboards used by 3 clinics
- Led query tuning work on the reporting database

Acme Corp — Junior Engineer (2018-2020)
- Maintained the billing pipeline
"""


def _response(bullets: list[str], *, summary: str = "") -> dict:
    return {
        "summary": summary,
        "work_history": [
            {"company": "OneOncology", "bullets": bullets},
        ],
    }


def test_clean_extraction_passes():
    resp = _response(["Built internal reporting dashboards used by 3 clinics"])
    result = build_parse_provenance(resp, source_text=SOURCE)
    assert result["checked"] is True
    assert result["flagged"] == []


def test_fabricated_metric_is_flagged():
    """The exact production defect: a % figure the user never wrote."""
    resp = _response(["Reduced report load time 40% through query tuning"])
    result = build_parse_provenance(resp, source_text=SOURCE)
    assert len(result["flagged"]) == 1
    entry = result["flagged"][0]
    assert entry["kind"] == "work_bullet"
    assert entry["company"] == "OneOncology"
    assert entry["bullet_index"] == 0
    assert any("40%" in term for term in entry["unsourced_terms"])


def test_sourced_metric_passes():
    source = SOURCE + "\n- Cut report load time 40% via query tuning\n"
    resp = _response(["Cut report load time 40% via query tuning"])
    assert build_parse_provenance(resp, source_text=source)["flagged"] == []


def test_fabricated_employer_in_summary_is_flagged():
    resp = _response([], summary="Engineer with award-winning work at Initech Solutions")
    result = build_parse_provenance(resp, source_text=SOURCE)
    assert len(result["flagged"]) == 1
    assert result["flagged"][0]["kind"] == "summary"
    assert any("Initech" in term for term in result["flagged"][0]["unsourced_terms"])


def test_multiple_flags_report_each_bullet_independently():
    resp = _response([
        "Maintained the billing pipeline",          # clean (in source)
        "Saved $250K annually through caching",      # fabricated dollar figure
        "Scaled the platform 10x in 2019",           # fabricated multiplier + year not tied? 2019 within 2018-2020 range text? '2019' absent
    ])
    result = build_parse_provenance(resp, source_text=SOURCE)
    flagged_indexes = {e["bullet_index"] for e in result["flagged"]}
    assert 0 not in flagged_indexes
    assert 1 in flagged_indexes
    assert 2 in flagged_indexes


def test_empty_response_is_checked_and_clean():
    result = build_parse_provenance({}, source_text=SOURCE)
    assert result == {"checked": True, "flagged": []}


def test_blank_bullets_are_skipped():
    resp = _response(["", "   "])
    assert build_parse_provenance(resp, source_text=SOURCE)["flagged"] == []
