/** What a charge is for. Mirrors ``RENT_CHARGE_TYPES`` in
 *  ``backend/app/core/rent_ledger_enums.py``. */
export type RentChargeType =
  | "rent"
  | "late_fee"
  | "utility_reimbursement"
  | "deposit"
  | "other";
