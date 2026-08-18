"""Fetch Freddie Mac's weekly mortgage-rate survey from FRED.

Network boundary only, exactly like ``tdi_rate_filings_client``: this module
turns a CSV into two observations and knows nothing about anyone's loan. A
failure raises rather than returning a default, because "we could not reach
the survey" and "the market has not moved" must never render as the same
sentence.
"""
from __future__ import annotations

import asyncio
import csv
import datetime as _dt
import io
import logging
import time
from decimal import Decimal, InvalidOperation

import httpx

from app.core.config import settings
from app.core.mortgage_enums import TERM_MONTHS_15_YEAR, TERM_MONTHS_30_YEAR
from app.core.pmms_rate_constants import (
    PMMS_BACKOFF_SECONDS,
    PMMS_CACHE_TTL_SECONDS,
    PMMS_CSV_URL,
    PMMS_MAX_ATTEMPTS,
    PMMS_MAX_OBSERVATION_AGE_DAYS,
    PMMS_REQUEST_TIMEOUT_SECONDS,
    PMMS_SERIES_IDS,
    SERIES_15_YEAR,
    SERIES_30_YEAR,
)
from app.schemas.mortgage.mortgage_rate_observation import MortgageRateObservation
from app.schemas.mortgage.mortgage_rate_survey import MortgageRateSurvey

logger = logging.getLogger(__name__)

_SERIES_TERM_MONTHS = {
    SERIES_30_YEAR: TERM_MONTHS_30_YEAR,
    SERIES_15_YEAR: TERM_MONTHS_15_YEAR,
}


class MortgageRateFeedUnavailableError(RuntimeError):
    """The survey could not be reached or returned something unusable."""


# Process-local. Holds a public national average, nothing user-specific.
_cache: tuple[float, MortgageRateSurvey] | None = None


def _user_agent() -> str:
    base = settings.app_url or "https://mybookkeeper.app"
    return f"MyBookkeeper-MortgageRateWatch/1.0 ({base})"


async def _request_csv() -> str:
    delay = PMMS_BACKOFF_SECONDS

    async with httpx.AsyncClient(timeout=PMMS_REQUEST_TIMEOUT_SECONDS) as client:
        for attempt in range(1, PMMS_MAX_ATTEMPTS + 1):
            try:
                response = await client.get(
                    PMMS_CSV_URL,
                    params={"id": ",".join(PMMS_SERIES_IDS)},
                    headers={"User-Agent": _user_agent(), "Accept": "text/csv"},
                    follow_redirects=True,
                )
                response.raise_for_status()
                return response.text
            except httpx.HTTPStatusError as exc:
                # Per rules/check-third-party-error-codes.md: FRED explains a
                # refused request in the body, so log it rather than only the
                # status. A 400 here means the series ids were rejected, which
                # is a code bug and not an outage.
                logger.warning(
                    "FRED PMMS returned HTTP %s: %s",
                    exc.response.status_code,
                    exc.response.text[:200],
                )
                raise MortgageRateFeedUnavailableError(
                    "mortgage rate survey returned an error"
                ) from exc
            except httpx.TransportError as exc:
                if attempt >= PMMS_MAX_ATTEMPTS:
                    logger.warning(
                        "FRED PMMS unreachable after %s attempt(s): %s",
                        attempt,
                        exc,
                    )
                    raise MortgageRateFeedUnavailableError(
                        "mortgage rate survey is unreachable"
                    ) from exc
                logger.info(
                    "FRED PMMS attempt %s failed (%s) — retrying in %ss",
                    attempt,
                    exc,
                    delay,
                )
                await asyncio.sleep(delay)
                delay *= 2
            except httpx.HTTPError as exc:
                logger.warning("FRED PMMS unreachable: %s", exc)
                raise MortgageRateFeedUnavailableError(
                    "mortgage rate survey is unreachable"
                ) from exc

    # Unreachable: every path through the loop returns or raises.
    raise MortgageRateFeedUnavailableError("mortgage rate survey is unreachable")


def parse_survey_csv(body: str, *, today: _dt.date) -> MortgageRateSurvey:
    """Take the newest usable reading of each series out of the export.

    Three properties of this file drive the shape of this function, all of them
    observed rather than assumed:

    * It carries the full history back to 1971 — the documented ``cosd``
      start-date parameter is ignored by the graph export — so the tail is what
      matters and the head is noise.
    * In a multi-series export the columns are RAGGED. The 30-year series
      starts in 1971 and the 15-year in 1991, so early rows carry an empty cell
      for the younger series. Reading "the last row" for both would work today
      and break the week either series misses a publication.
    * Missing values also appear mid-history as ``.``, FRED's null marker.

    So each series is scanned independently for its own newest non-empty value.
    """
    reader = csv.DictReader(io.StringIO(body))
    if reader.fieldnames is None:
        raise MortgageRateFeedUnavailableError(
            "mortgage rate survey returned an empty document"
        )

    date_field = reader.fieldnames[0]
    missing = [s for s in PMMS_SERIES_IDS if s not in reader.fieldnames]
    if missing:
        logger.warning(
            "FRED PMMS export is missing series %s; columns were %s",
            missing,
            reader.fieldnames,
        )
        raise MortgageRateFeedUnavailableError(
            "mortgage rate survey returned an unexpected shape"
        )

    latest: dict[str, MortgageRateObservation] = {}
    for row in reader:
        raw_date = (row.get(date_field) or "").strip()
        if not raw_date:
            continue
        try:
            observed_on = _dt.date.fromisoformat(raw_date)
        except ValueError:
            continue

        for series_id in PMMS_SERIES_IDS:
            raw_rate = (row.get(series_id) or "").strip()
            if not raw_rate or raw_rate == ".":
                continue
            try:
                rate = Decimal(raw_rate)
            except InvalidOperation:
                continue
            if rate <= 0:
                continue
            known = latest.get(series_id)
            if known is not None and known.observed_on >= observed_on:
                continue
            latest[series_id] = MortgageRateObservation(
                series_id=series_id,
                term_months=_SERIES_TERM_MONTHS[series_id],
                rate_pct=rate,
                observed_on=observed_on,
            )

    if len(latest) != len(PMMS_SERIES_IDS):
        raise MortgageRateFeedUnavailableError(
            "mortgage rate survey returned no usable observations"
        )

    for observation in latest.values():
        age_days = (today - observation.observed_on).days
        if age_days > PMMS_MAX_OBSERVATION_AGE_DAYS:
            logger.warning(
                "FRED PMMS series %s is %s days stale (observed %s)",
                observation.series_id,
                age_days,
                observation.observed_on,
            )
            raise MortgageRateFeedUnavailableError(
                "mortgage rate survey has not published recently"
            )

    return MortgageRateSurvey(
        thirty_year=latest[SERIES_30_YEAR],
        fifteen_year=latest[SERIES_15_YEAR],
    )


async def fetch_rate_survey(*, today: _dt.date) -> MortgageRateSurvey:
    """The latest 30-year and 15-year fixed averages, cached per process."""
    global _cache

    if _cache is not None and (time.monotonic() - _cache[0]) < PMMS_CACHE_TTL_SECONDS:
        return _cache[1]

    survey = parse_survey_csv(await _request_csv(), today=today)
    _cache = (time.monotonic(), survey)
    return survey
