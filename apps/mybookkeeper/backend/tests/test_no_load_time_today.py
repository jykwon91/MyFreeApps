"""Test modules must not read today's date when they load.

A module-level ``_TODAY = datetime.now(...).date()`` is fixed when pytest
imports the file. If the run crosses UTC midnight before the test runs, the
value is a day stale and date-checking tests fail. Call
``tests.utc_today.utc_today()`` inside the test instead.
"""
import re
from pathlib import Path

_TESTS_DIR = Path(__file__).parent
_LOAD_TIME_TODAY = re.compile(r"^[A-Za-z_][A-Za-z0-9_]* = .*(\.now\(|\.today\(|\.utcnow\(|\butc_today(_params)?\()", re.MULTILINE)


def test_no_test_module_reads_today_at_import() -> None:
    offenders = [
        f"{path.relative_to(_TESTS_DIR)}:{text.count(chr(10), 0, match.start()) + 1}: {match.group(0)}"
        for path in sorted(_TESTS_DIR.rglob("*.py"))
        for text in [path.read_text()]
        for match in _LOAD_TIME_TODAY.finditer(text)
    ]
    assert offenders == [], "\n".join(offenders)
