"""Tests for the docs-exposure policy helper."""
import pytest

from platform_shared.core.openapi import docs_kwargs


def test_production_disables_all_three():
    assert docs_kwargs("production") == {
        "docs_url": None,
        "redoc_url": None,
        "openapi_url": None,
    }


@pytest.mark.parametrize("env", ["development", "test", "staging", "", "prod"])
def test_non_production_keeps_defaults(env):
    # Only the exact string "production" gates docs; everything else (including
    # a misspelled "prod") leaves FastAPI's defaults so docs stay reachable.
    assert docs_kwargs(env) == {}
