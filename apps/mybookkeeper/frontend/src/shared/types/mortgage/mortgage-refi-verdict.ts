/**
 * The call the rate check makes about one loan.
 *
 * Mirrors ``REFI_VERDICTS`` in ``backend/app/core/mortgage_enums.py``.
 *
 * ``marginal`` exists so a real rate gap whose closing costs take years to
 * repay is not shown as an opportunity. That case is the one a rate-only
 * comparison gets wrong, and it is the common one.
 */
export type MortgageRefiVerdict =
  | "not_checkable"
  | "no_action"
  | "marginal"
  | "worth_pricing";
