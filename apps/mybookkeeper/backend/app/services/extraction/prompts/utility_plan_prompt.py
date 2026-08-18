"""Prompt for reading a utility plan out of an EFL, bill, or enrollment notice.

Deliberately separate from ``DEFAULT_PROMPT``. That prompt answers "what did
this cost and how should it be categorized" — a transaction. This one answers
"what are the terms I am on", which is a different question with a different
shape: no amount, no date paid, no category, and a dozen fields the transaction
prompt has never heard of.

The instructions are written against Texas deregulated-electricity documents
because that is what the data is, but the JSON contract covers gas, water and
internet too.

Two rules matter more than the rest, and both are about refusing to guess:

1. **A missing value is null, never an inference.** These numbers drive
   plan-vs-plan comparisons. A plausible-looking invented rate is worse than a
   blank, because a blank is visibly unknown and a number is not.
2. **Anything real that has no column goes in ``unrepresented``.** A second
   bill-credit tier, a tiered TDU schedule, a bundled service — the schema
   cannot hold it, so it has to be said out loud rather than dropped. Silence
   would read as "the document did not mention it".

``notes`` has a section describing its shape because it is rendered to the
operator verbatim. Left undescribed, the sibling insurance prompt returned it as
one unbroken block of over two thousand characters, with the fee itemisation and
the arithmetic check buried mid-paragraph. Asking for one subject per paragraph
fixed it there; the same instruction is carried here so the two documents read
alike.
"""

UTILITY_PLAN_PROMPT = """You read utility service documents and report the plan terms they state.

Typical inputs: a Texas Electricity Facts Label (EFL), an electricity or gas
bill, an enrollment or plan-change notice, or an internet service agreement.

Return ONLY a JSON object, no prose and no markdown fence, in this shape:

{
  "service_type": "electricity" | "natural_gas" | "water" | "internet" | null,
  "provider_name": string | null,
  "plan_name": string | null,
  "account_number": string | null,
  "rate_type": "fixed" | "variable" | "indexed" | "regulated" | null,

  "energy_charge_cents_per_kwh": string | null,
  "tdu_charge_cents_per_kwh": string | null,
  "avg_price_cents_per_kwh_at_1000": string | null,
  "monthly_base_charge_cents": integer | null,

  "term_months": integer | null,
  "service_start_date": "YYYY-MM-DD" | null,
  "term_end_date": "YYYY-MM-DD" | null,
  "early_termination_fee_cents": integer | null,

  "has_bill_credit": boolean,
  "bill_credit_amount_cents": integer | null,
  "bill_credit_threshold_kwh": integer | null,
  "min_usage_fee_cents": integer | null,
  "min_usage_threshold_kwh": integer | null,

  "post_promo_monthly_cents": integer | null,
  "equipment_fee_monthly_cents": integer | null,
  "download_mbps": integer | null,
  "upload_mbps": integer | null,
  "data_cap_gb": integer | null,

  "document_issued_date": "YYYY-MM-DD" | null,
  "confidence": "high" | "medium" | "low",
  "notes": string | null,
  "unrepresented": [string]
}

# Units, without exception

- Fields ending in `_cents_per_kwh` are STRINGS with exactly four decimal
  places: "10.0000", "5.1461". A rate of 5.3509 rounded to 5.35 misprices every
  comparison built on it, so do not shorten.
- Fields ending in `_cents` are INTEGERS of cents. $150.00 is 15000. $0.00 is 0.
- Never return a currency symbol, a comma, or a percentage sign in any field.

# Refusing to guess

- If the document does not state a value, return null. Do not derive it, do not
  carry it over from a similar plan, do not use a typical market figure.
- `0` and `null` are different answers. An EFL that states "Minimum Usage Fee:
  $0.00" means 0 — a recorded fact. An EFL that never mentions a minimum usage
  fee means null. Report what the document did.
- If the document is not a utility plan document at all, return every field
  null, `has_bill_credit` false, `confidence` "low", and say so in `notes`.

# Reading a Texas EFL

- "Average Monthly Use" table: take the 1,000 kWh column into
  `avg_price_cents_per_kwh_at_1000`. Ignore the 500 and 2,000 kWh columns; if
  they reveal something the 1,000 figure hides (a steep tier), say so in
  `notes`.
- `energy_charge_cents_per_kwh` is the SUPPLIER's per-kWh charge only.
- `tdu_charge_cents_per_kwh` is the utility's delivery charge (CenterPoint,
  Oncor, AEP). Report it if stated, but it is a pass-through the utility
  re-tariffs mid-term — so also set `document_issued_date` so the reader can
  tell how stale it is. If the TDU charge is stated as a per-kWh rate plus a
  fixed monthly amount, put the per-kWh part here and the monthly part in
  `notes` — do not add them together.
- `monthly_base_charge_cents` is the supplier's fixed monthly charge ("Base
  Charge", "Monthly Service Fee"). If the EFL states it is $0, return 0.
- Early termination fee: the flat amount, not "$20 per remaining month". If the
  fee is per-month, leave `early_termination_fee_cents` null and describe it in
  `notes` — a per-month fee stored as a flat one is simply wrong.
- Usage bill credits: `bill_credit_amount_cents` is the credit, and
  `bill_credit_threshold_kwh` is the usage at or above which it applies. If the
  plan has MORE THAN ONE credit tier, report the lowest threshold's tier in the
  fields and put every other tier in `unrepresented` — there is only one pair
  of columns.
- `rate_type`: "fixed" if the energy charge is fixed for the term, "variable"
  if the price can change month to month, "indexed" if it tracks a published
  index. Regulated gas and municipal water are "regulated".

# Reading an internet document

- `monthly_base_charge_cents` is the CURRENT monthly price — the promotional
  price if one is running.
- `post_promo_monthly_cents` is what it becomes when the promo ends. Only set
  it if the document states a specific price; "then regular rates apply" with
  no number is null plus a `notes` line.
- `equipment_fee_monthly_cents` is modem/router/gateway rental, only when it is
  billed separately from the monthly price.
- Speeds are in Mbps. "1 Gig" / "1 Gbps" is 1000. "Up to 500 Mbps" is 500.
- `data_cap_gb`: 1.2 TB is 1200. Unlimited is null, not 0.
- Leave every `_kwh` field null — an internet plan does not price kilowatt-hours.

# Reading a bill rather than a plan document

A bill states usage and an amount owed, not contract terms. Extract only what
it actually states about the plan — usually `provider_name`, `account_number`,
`service_type`, and sometimes `plan_name` or a contract-end notice. Do NOT
convert the bill's total into any rate field, and set `confidence` to "low"
unless the bill genuinely restates the plan terms.

# confidence

- "high": the document is a plan document (EFL, agreement, enrollment notice)
  and the fields were read directly off it.
- "medium": a plan document that was partly illegible, or a bill that restated
  the terms.
- "low": a bill or notice that mostly implies the terms, or anything you had to
  work to interpret.

# notes

Your own account of the document, read beside the fields rather than instead of
them. Everything that did not fit a field and is not a term for `unrepresented`:
who the provider and the REP actually are, how a rate was arrived at, the
arithmetic you checked, whatever you could not read, and anything about the
document that changes how far the fields should be trusted.

Write it as short paragraphs separated by a blank line, one subject each — the
parties, the money, what you could not read. It is displayed to the operator
exactly as you write it, beside the fields. A single unbroken block of several
hundred words is where the one line that mattered goes to be missed.

# unrepresented

One plain sentence per real term you found that has no field above. Examples:
"second bill credit of $15.00 for usage at or above 2,000 kWh", "TDU charge is
tiered by season", "price includes bundled A/C and water-heater coverage".
Return an empty list if everything the document stated fit.
"""
