"""The inspect CLI's filters match what an operator asks for."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Session

from app.cli.inspect import _since, _tax_forms_query


def test_cutoff_is_utc_aware_so_postgres_does_not_read_it_as_local_time() -> None:
    cutoff = _since(timedelta(hours=1))
    assert cutoff.utcoffset() == timedelta(0)
    assert abs((datetime.now(timezone.utc) - cutoff) - timedelta(hours=1)) < timedelta(seconds=5)


def _sql(year: int | None) -> str:
    return str(_tax_forms_query(Session(), year).statement.compile(dialect=postgresql.dialect()))


def test_tax_forms_reads_columns_the_table_has() -> None:
    assert "tax_form_instances.form_name" in _sql(None)
    assert "tax_returns" not in _sql(None)


def test_tax_forms_year_filters_by_the_return_year() -> None:
    assert "tax_returns.tax_year = %(tax_year_1)s" in _sql(2025)
