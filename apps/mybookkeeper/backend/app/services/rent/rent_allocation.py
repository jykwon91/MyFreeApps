"""FIFO allocation of tenant payments against tenant charges.

Deliberately pure: it takes plain value objects, not ORM rows or a session, so
the settlement rule is testable in isolation and cannot accidentally depend on
query order or lazy loading.

**The rule.** Charges are consumed oldest-first by due date; payments are
applied oldest-first by payment date. Each payment fills the oldest charge that
still has a remaining balance, spilling into the next charge when it more than
covers one. This is the standard rental application-of-funds convention and it
is what makes a weekly payer against a monthly charge legible: four $375
payments fill one $1,500 month exactly, and the fifth opens the next month.

**Why derived rather than stored.** Allocation is a total function of
(charges, payments). Persisting it would create a second copy that goes stale
the moment a payment is edited, re-attributed to a different tenant, or
soft-deleted — and the failure would be silent, because a stale allocation
still reads as a valid one. Recomputing costs a single pass over a few hundred
rows per tenant.

**What is not rent.** Security-deposit transactions are excluded upstream by
the repository query: a deposit is held, not earned, so letting it settle a
rent charge would show a tenant as paid-up on money the host owes back.
"""
from __future__ import annotations

import datetime as _dt
from dataclasses import dataclass, field
from decimal import Decimal

_ZERO = Decimal("0.00")


@dataclass(frozen=True, slots=True)
class ChargeInput:
    """The subset of a charge the allocator needs."""

    id: object
    due_date: _dt.date
    amount: Decimal
    # Last day of the period this charge covers. Drives the overdue rule below;
    # for a one-off charge with no real span it equals ``due_date``.
    period_end: _dt.date
    is_waived: bool = False
    # Last day the charge can be short without being called overdue. Defaults
    # to ``period_end``: a tenant part-way through the period they are paying
    # for is *in progress*, not delinquent. This is the whole point of the
    # domain — a monthly charge paid weekly is short for most of the month by
    # construction, and flagging that as overdue would make the ledger cry wolf
    # every week. A host who enforces a hard due date (rent due the 1st, late
    # after the 5th) sets this explicitly instead.
    overdue_after: _dt.date | None = None
    # Tie-break for charges sharing a due date, so allocation is deterministic
    # regardless of the order rows come back from the database.
    sort_key: tuple = ()


@dataclass(frozen=True, slots=True)
class PaymentInput:
    """The subset of a payment the allocator needs."""

    id: object
    paid_on: _dt.date
    amount: Decimal
    sort_key: tuple = ()


@dataclass(frozen=True, slots=True)
class Application:
    """One payment's contribution to one charge."""

    charge_id: object
    payment_id: object
    amount: Decimal


@dataclass(slots=True)
class ChargeSettlement:
    charge_id: object
    due_date: _dt.date
    period_end: _dt.date
    amount: Decimal
    allocated: Decimal
    is_waived: bool
    overdue_after: _dt.date | None = None
    applications: list[Application] = field(default_factory=list)

    @property
    def remaining(self) -> Decimal:
        if self.is_waived:
            return _ZERO
        return self.amount - self.allocated

    def status(self, as_of: _dt.date) -> str:
        if self.is_waived:
            return "waived"
        if self.allocated >= self.amount:
            return "paid"
        deadline = self.overdue_after or self.period_end
        if as_of > deadline:
            return "overdue"
        return "partial" if self.allocated > _ZERO else "open"


@dataclass(slots=True)
class AllocationResult:
    settlements: list[ChargeSettlement]
    # Payment id -> amount not applied to any charge. Non-zero when the tenant
    # has paid ahead of what has been charged so far; it is a credit, not an
    # error, and it lands on the next generated charge automatically.
    unapplied: dict[object, Decimal]

    @property
    def total_charged(self) -> Decimal:
        return sum(
            (s.amount for s in self.settlements if not s.is_waived), start=_ZERO,
        )

    @property
    def total_allocated(self) -> Decimal:
        return sum((s.allocated for s in self.settlements), start=_ZERO)

    @property
    def total_unapplied(self) -> Decimal:
        return sum(self.unapplied.values(), start=_ZERO)

    @property
    def balance(self) -> Decimal:
        """Positive = tenant owes; negative = tenant is in credit."""
        return self.total_charged - self.total_allocated - self.total_unapplied


def allocate(
    charges: list[ChargeInput], payments: list[PaymentInput],
) -> AllocationResult:
    """Apply ``payments`` to ``charges`` oldest-first.

    Waived charges are carried through so the ledger can still display them,
    but they absorb nothing.
    """
    ordered_charges = sorted(charges, key=lambda c: (c.due_date, c.sort_key))
    ordered_payments = sorted(payments, key=lambda p: (p.paid_on, p.sort_key))

    settlements = [
        ChargeSettlement(
            charge_id=c.id,
            due_date=c.due_date,
            period_end=c.period_end,
            amount=c.amount,
            allocated=_ZERO,
            is_waived=c.is_waived,
            overdue_after=c.overdue_after,
        )
        for c in ordered_charges
    ]
    unapplied: dict[object, Decimal] = {}

    cursor = 0
    for payment in ordered_payments:
        left = payment.amount
        while left > _ZERO and cursor < len(settlements):
            target = settlements[cursor]
            if target.remaining <= _ZERO:
                cursor += 1
                continue
            applied = min(left, target.remaining)
            target.allocated += applied
            target.applications.append(
                Application(
                    charge_id=target.charge_id,
                    payment_id=payment.id,
                    amount=applied,
                ),
            )
            left -= applied
        if left > _ZERO:
            unapplied[payment.id] = left

    return AllocationResult(settlements=settlements, unapplied=unapplied)
