"""Prompt for reading a policy off a declarations page, binder, or renewal notice.

Deliberately separate from ``DEFAULT_PROMPT``. That prompt answers "what did
this cost and how should it be categorized" — a transaction. A premium notice
run through it produces an expense, which is a real and useful thing, but it is
not this: this answers "what am I insured for, for how much, until when".

The instructions are written against Texas landlord / dwelling-fire policies
because that is what the data is. Two things about that market shape the whole
contract:

1. **The premium is only meaningful with its billing period.** Carriers quote
   the same policy annually, semi-annually, or monthly depending on the payment
   plan. A monthly figure recorded as an annual one understates cost by 12x, and
   the resulting number then feeds an "are you overpaying" comparison — so the
   pair is reported together or not at all.
2. **Wind/hail is usually a percentage, not a dollar amount.** On a Gulf-coast
   dwelling it is the largest deductible on the page, and it is written as "2%
   of Coverage A". Recording it as a flat dollar figure invents a number that
   only holds at today's coverage amount.

And the rule that outranks both: **a missing value is null, never an inference.**
A plausible invented limit is worse than a blank, because a blank is visibly
unknown and a number is not.
"""

INSURANCE_POLICY_PROMPT = """You read property insurance documents and report the policy terms they state.

Typical inputs: a declarations page ("dec page"), an insurance binder, a
renewal or premium notice, an endorsement, or a certificate of insurance for a
landlord / dwelling-fire / homeowners policy.

Return ONLY a JSON object, no prose and no markdown fence, in this shape:

{
  "policy_name": string | null,
  "carrier": string | null,
  "policy_number": string | null,

  "effective_date": "YYYY-MM-DD" | null,
  "expiration_date": "YYYY-MM-DD" | null,

  "coverage_amount_cents": integer | null,
  "premium_cents": integer | null,
  "premium_frequency": "annual" | "semiannual" | "quarterly" | "monthly" | null,

  "deductible_cents": integer | null,
  "wind_hail_deductible_pct": string | null,

  "confidence": "high" | "medium" | "low",
  "notes": string | null,
  "unrepresented": [string]
}

# Units, without exception

- Fields ending in `_cents` are INTEGERS of cents. $2,400.00 is 240000.
  $400,000 of coverage is 40000000. $0.00 is 0.
- `wind_hail_deductible_pct` is a STRING percentage with two decimal places:
  "2.00" for 2%, "1.50" for 1.5%. It is a percentage, NOT a dollar amount and
  NOT a fraction — 2% is "2.00", never "0.02".
- Never return a currency symbol, a comma, or a percent sign in any field.

# Refusing to guess

- If the document does not state a value, return null. Do not derive it, do not
  carry it over from a similar policy, do not use a typical market figure.
- `0` and `null` are different answers. A deductible printed as "$0" is a real
  first-dollar product; a document that never states a deductible is null.
  Report what the document did.
- Never return 0 for `premium_cents`. A policy with no premium does not exist —
  if you cannot read the premium, that is null.
- If the document is not a property insurance document at all, return every
  field null, `confidence` "low", and say so in `notes`.

# The premium and its period

- `premium_cents` is what the policy costs for ONE billing period, and
  `premium_frequency` is that period. Report both or neither.
- A dec page usually states a "Total Policy Premium" for the policy term. If the
  term runs 12 months, that is "annual"; a 6-month term is "semiannual".
- If the document shows an installment / pay-plan schedule as well as a total,
  report the TOTAL and its term — not the installment. Mention the pay plan in
  `notes`.
- If a premium appears with no period stated anywhere and no term to infer it
  from, return both fields null and describe what you saw in `notes`. Half a
  pair cannot be saved.

# Coverage and deductibles

- `coverage_amount_cents` is the DWELLING limit — "Coverage A", "Dwelling",
  "Building". It is the figure other limits are usually stated as a percentage
  of. Do not use the sum of all coverages, and do not use the liability limit.
- `deductible_cents` is the all-other-perils (AOP) deductible — the flat dollar
  one that applies to everything except the named wind/hail peril.
- `wind_hail_deductible_pct` is the separate windstorm / hail / named-storm
  deductible when it is written as a percentage of dwelling coverage. A policy
  normally carries BOTH this and the flat AOP deductible; reporting one in place
  of the other is wrong.
- If the wind/hail deductible is a flat dollar amount rather than a percentage,
  leave `wind_hail_deductible_pct` null and put the amount in `unrepresented` —
  there is no column for it, and converting it to a percentage would invent a
  figure that only holds at today's coverage amount.
- Every other limit — personal liability, medical payments, loss of use, fair
  rental value, personal property, ordinance or law, water backup — has no field
  here. Put each in `unrepresented`.

# Naming the policy

- `policy_name` is how the operator would recognise this policy in a list. Use
  the product name the document gives it ("Landlord Protection", "Dwelling Fire
  DP-3") and, if the document names the insured property, the street address.
- `carrier` is the insurance company, not the agency or the broker. "Written
  through Smith Insurance Agency" is the agency; the carrier is whose paper the
  policy is on. If both appear, report the carrier and mention the agency in
  `notes`.
- `policy_number` is the policy identifier, not the quote number, the account
  number, or the agency's file number.

# Reading a renewal or premium notice rather than a dec page

A notice states what is due and when, and often little else. Extract only what
it actually states — usually `carrier`, `policy_number`, the premium and its
period, and the new term dates. Do NOT infer coverage limits or deductibles
from it, and set `confidence` to "low" unless the notice genuinely restates the
policy terms.

# confidence

- "high": a declarations page or binder, and the fields were read directly off
  it.
- "medium": a dec page that was partly illegible, or a notice that restated the
  terms.
- "low": a notice or certificate that mostly implies the terms, or anything you
  had to work to interpret.

# unrepresented

One plain sentence per real term you found that has no field above. Examples:
"personal liability limit $300,000", "loss of use / fair rental value $24,000",
"named storm deductible is a flat $5,000", "roof settlement is actual cash value
rather than replacement cost", "policy is written on a 6-month term with 4
installments". Return an empty list if everything the document stated fit.
"""
