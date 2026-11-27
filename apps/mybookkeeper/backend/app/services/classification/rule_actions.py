"""File a transaction the way a payee rule says: category, scope, and property or split.

Used for a bank row as it syncs and for "apply to past payments". Neither ever
refiles a row a person filed (``filed_by_person_at``); callers pick only rows
without one, and filing by rule never sets it.

A rule only files a row going the same way as its category (an expense rule
never turns a refund into an expense), and a rule that says nothing about
scope leaves personal rows alone: a category learned from a rental correction
means nothing for personal spending.
"""
from __future__ import annotations

import uuid
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.property_split_constants import MIN_SPLIT_SHARES
from app.core.spending_category_enums import TRANSACTION_SCOPE_PERSONAL
from app.core.tags import (
    CATEGORY_TO_SCHEDULE_E,
    TRANSACTION_TYPE_TRANSFER,
    schedule_e_line_after_category_change,
    transaction_type_for_category,
)
from app.core.tax_total_inputs import tax_total_inputs
from app.core.transaction_statuses import NOT_MONEY_STATUSES
from app.models.classification.classification_rule import ClassificationRule
from app.models.transactions.transaction import Transaction
from app.repositories.tax import tax_return_repo
from app.repositories.transactions import property_split_repo
from app.services.transactions.property_split_math import even_shares
from app.services.transactions.property_split_service import apply_split
from app.services.transactions.scope_rules import apply_scope_rules

_UNCATEGORIZED = "uncategorized"


def rule_applies_to(rule: ClassificationRule, txn: Transaction) -> bool:
    """Whether the rule may file this row at all."""
    if txn.transaction_type == TRANSACTION_TYPE_TRANSFER or txn.status in NOT_MONEY_STATUSES:
        return False
    if transaction_type_for_category(rule.category) != txn.transaction_type:
        return False
    return rule.transaction_scope is not None or txn.transaction_scope != TRANSACTION_SCOPE_PERSONAL


def _target_scope(rule: ClassificationRule, txn: Transaction) -> str:
    return rule.transaction_scope or txn.transaction_scope


def _target_shares(rule: ClassificationRule, txn: Transaction) -> list[tuple[uuid.UUID, Decimal]] | None:
    """The even split the rule asks for on this row, or None when it doesn't split it."""
    ids = rule.split_property_ids
    if len(ids) < MIN_SPLIT_SHARES or _target_scope(rule, txn) == TRANSACTION_SCOPE_PERSONAL:
        return None
    # One cent per property at least; a smaller payment stays unsplit.
    if txn.amount * 100 < len(ids):
        return None
    return list(zip(ids, even_shares(txn.amount, len(ids)), strict=True))


def _target_property(rule: ClassificationRule, txn: Transaction) -> uuid.UUID | None:
    """The one property the rule files the row under, if it names one."""
    if _target_scope(rule, txn) == TRANSACTION_SCOPE_PERSONAL:
        return None
    if rule.property_id is not None:
        return rule.property_id
    # A split rule left with one property after the others were deleted.
    return rule.split_property_ids[0] if len(rule.split_property_ids) == 1 else None


def _current_shares(txn: Transaction) -> list[tuple[uuid.UUID | None, Decimal]]:
    return sorted(((share.property_id, share.amount) for share in txn.property_splits), key=str)


def would_refile(rule: ClassificationRule, txn: Transaction) -> bool:
    """Whether filing the row by this rule would change anything."""
    if not rule_applies_to(rule, txn):
        return False
    if txn.category != rule.category or txn.transaction_scope != _target_scope(rule, txn):
        return True
    shares = _target_shares(rule, txn)
    if shares is not None:
        return txn.property_id is not None or _current_shares(txn) != sorted(shares, key=str)
    if _target_scope(rule, txn) == TRANSACTION_SCOPE_PERSONAL:
        return txn.property_id is not None or bool(txn.property_splits)
    target = _target_property(rule, txn)
    return target is not None and (txn.property_id != target or bool(txn.property_splits))


async def file_by_rule(db: AsyncSession, txn: Transaction, rule: ClassificationRule) -> bool:
    """File the row as the rule says. Returns whether the rule applied."""
    if not rule_applies_to(rule, txn):
        return False
    old_tax_inputs = tax_total_inputs(txn)
    was_personal = txn.transaction_scope == TRANSACTION_SCOPE_PERSONAL
    old_category = txn.category

    txn.category = rule.category
    txn.transaction_type = transaction_type_for_category(rule.category)
    txn.tags = [rule.category if tag == old_category else tag for tag in txn.tags or []] or [rule.category]
    if rule.activity_id is not None:
        txn.activity_id = rule.activity_id
    txn.transaction_scope = _target_scope(rule, txn)
    if txn.transaction_scope != TRANSACTION_SCOPE_PERSONAL and (was_personal or old_category != rule.category):
        # The bank-row classifier's defaults, which the row had or would have had.
        txn.schedule_e_line = (
            CATEGORY_TO_SCHEDULE_E.get(rule.category) if was_personal
            else schedule_e_line_after_category_change(txn.schedule_e_line, old_category, rule.category)
        )
        txn.tax_relevant = rule.category != _UNCATEGORIZED
    apply_scope_rules(txn)

    shares = _target_shares(rule, txn)
    if shares is not None:
        await apply_split(db, txn, shares)
    elif txn.transaction_scope == TRANSACTION_SCOPE_PERSONAL:
        txn.property_id = None
        property_split_repo.clear_shares(txn)
    else:
        target = _target_property(rule, txn)
        if target is not None:
            txn.property_id = target
            property_split_repo.clear_shares(txn)

    await tax_return_repo.flag_unfiled_if_totals_moved(db, txn, old_tax_inputs)
    rule.times_applied = (rule.times_applied or 0) + 1
    return True
