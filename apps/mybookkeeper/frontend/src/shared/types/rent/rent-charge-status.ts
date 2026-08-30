/** Derived settlement state of a charge. Mirrors ``RENT_CHARGE_STATUSES`` in
 *  ``backend/app/core/rent_ledger_enums.py``.
 *
 *  ``overdue`` means the period ended without full payment — not that the due
 *  date passed. A tenant paying weekly against a monthly charge is ``partial``
 *  all month, which is the normal, healthy state. */
export type RentChargeStatus = "paid" | "partial" | "open" | "overdue" | "waived";
