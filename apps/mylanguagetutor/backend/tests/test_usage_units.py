"""Cost-unit math (pure) -- the numbers the daily caps are built on."""
from __future__ import annotations

from types import SimpleNamespace

from app.core.config import Settings
from app.services.tutor.usage_units import (
    CallUsage,
    estimate_input_tokens,
    reservation_units,
    units_for,
)


def test_units_weights_each_token_kind() -> None:
    usage = CallUsage(input_tokens=1000, output_tokens=100, cache_read_tokens=2000, cache_write_tokens=400)
    # 1000 + 0.1*2000 + 1.25*400 + 5*100 = 1000 + 200 + 500 + 500
    assert units_for(usage, weight=1.0) == 2200
    assert units_for(usage, weight=2.0) == 4400


def test_units_round_up() -> None:
    assert units_for(CallUsage(cache_read_tokens=1), weight=1.0) == 1


def test_zero_usage_is_free() -> None:
    assert units_for(CallUsage(), weight=2.0) == 0


def test_from_api_tolerates_missing_cache_fields() -> None:
    api = SimpleNamespace(
        input_tokens=10, output_tokens=5, cache_read_input_tokens=None, cache_creation_input_tokens=None,
    )
    assert CallUsage.from_api(api) == CallUsage(input_tokens=10, output_tokens=5)
    assert CallUsage.from_api(None) == CallUsage()


def test_usage_adds() -> None:
    total = CallUsage(1, 2, 3, 4) + CallUsage(10, 20, 30, 40)
    assert total == CallUsage(11, 22, 33, 44)


def test_estimate_is_an_upper_bound() -> None:
    # 2.5 chars/token is pessimistic vs real ~3.5-4 -> more tokens, never fewer.
    assert estimate_input_tokens(0) == 200
    assert estimate_input_tokens(1000) == 600


def test_reservation_assumes_worst_case() -> None:
    # every input token a cache write (1.25x) + full max_tokens of output (5x)
    assert reservation_units(input_tokens_est=1000, max_tokens=400, weight=1.0) == 1250 + 2000
    assert reservation_units(input_tokens_est=1000, max_tokens=400, weight=2.0) == 6500


def test_reservation_covers_any_actual_usage_within_the_bounds() -> None:
    reserved = reservation_units(input_tokens_est=1000, max_tokens=400, weight=1.0)
    worst_actual = CallUsage(input_tokens=0, output_tokens=400, cache_read_tokens=0, cache_write_tokens=1000)
    assert units_for(worst_actual, weight=1.0) <= reserved


def test_default_caps_match_the_documented_budget() -> None:
    fields = Settings.model_fields
    global_units = fields["ltutor_global_daily_units"].default
    user_units = fields["ltutor_user_daily_units"].default
    # 1 unit = $0.000001 -> global cap ~= $0.65/day ~= $20/month.
    assert 19.0 <= global_units * 1e-6 * 30.4 <= 21.0
    # ~8,000 units per typical turn -> ~30 turns per user per day.
    assert 25 <= user_units / 8_000 <= 35
    assert user_units < global_units
