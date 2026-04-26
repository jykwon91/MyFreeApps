from app.core.tags import sanitize_tags, REVENUE_TAGS, EXPENSE_TAGS


def test_single_revenue_tag_unchanged():
    assert sanitize_tags(["rental_revenue"]) == ["rental_revenue"]


def test_single_expense_tag_unchanged():
    assert sanitize_tags(["maintenance"]) == ["maintenance"]


def test_multiple_expense_tags_keeps_last():
    result = sanitize_tags(["maintenance", "contract_work"])
    assert "contract_work" in result
    assert "maintenance" not in result


def test_multiple_revenue_tags_keeps_last():
    result = sanitize_tags(["rental_revenue", "cleaning_fee_revenue"])
    assert "cleaning_fee_revenue" in result
    assert "rental_revenue" not in result


def test_one_revenue_and_one_expense_both_kept():
    result = sanitize_tags(["rental_revenue", "maintenance"])
    assert "rental_revenue" in result
    assert "maintenance" in result
    assert len(result) == 2


def test_non_financial_tags_preserved():
    result = sanitize_tags(["linen", "maintenance"])
    assert "linen" in result
    assert "maintenance" in result
    assert len(result) == 2


def test_non_financial_with_multiple_expense_keeps_last_expense():
    result = sanitize_tags(["linen", "maintenance", "contract_work"])
    assert "linen" in result
    assert "contract_work" in result
    assert "maintenance" not in result
    assert len(result) == 2


def test_empty_list():
    assert sanitize_tags([]) == []


def test_only_non_financial_tags():
    result = sanitize_tags(["linen", "net_income"])
    assert result == ["linen", "net_income"]
