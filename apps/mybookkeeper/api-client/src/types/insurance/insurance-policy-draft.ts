/**
 * A policy as read from a document — the response of
 * ``POST /insurance-policies/extract``.
 *
 * Mirrors ``schemas/insurance/insurance_policy_draft.py``. Deliberately NOT an
 * ``InsurancePolicyCreateRequest``: every field is optional (including
 * ``policy_name``, which a real policy requires) because a declarations page
 * that never names the product should still hand back the nine fields it did
 * state. ``premium_frequency`` is a plain string rather than the union because
 * the backend only guarantees it dropped values outside it — not that it found
 * one.
 *
 * ``wind_hail_deductible_pct`` arrives as a string, like every other decimal on
 * the wire, so 1.50 survives the JSON boundary without a float rounding it.
 */
export interface InsurancePolicyDraft {
  source_document_id: string;

  policy_name: string | null;
  carrier: string | null;
  policy_number: string | null;

  effective_date: string | null;
  expiration_date: string | null;

  coverage_amount_cents: number | null;
  premium_cents: number | null;
  premium_frequency: string | null;
  fees_and_taxes_cents: number | null;
  deductible_cents: number | null;
  wind_hail_deductible_pct: string | null;

  notes: string | null;

  /** How much of this came off the page rather than out of interpretation. */
  confidence: string;

  /** Reasons to distrust a specific field, e.g. a premium with no period. */
  warnings: string[];

  /** Real coverages the schema has no column for, e.g. a liability limit. */
  unrepresented: string[];
}
