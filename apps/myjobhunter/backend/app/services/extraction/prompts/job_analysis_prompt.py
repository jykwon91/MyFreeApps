"""System prompt for the Analyze-a-job feature.

This prompt asks Claude to score a single job description against the
operator's profile snapshot and emit a structured JSON envelope only.

Design notes
============

The prompt is deliberately rubric-driven and field-by-field strict so
Claude can't drift the output shape. Every prior session that asked
Claude for an "overall fit" verdict in free prose ended up with prose
the frontend then had to regex out of the response — this prompt makes
the verdict a typed enum and forces the per-dimension status into a
fixed token set.

Output contract
---------------

Return JSON with exactly these top-level keys:

* ``verdict``               — enum: ``strong_fit`` | ``worth_considering``
                              | ``stretch`` | ``mismatch``
* ``verdict_summary``       — one sentence, plain-English, no fluff
* ``dimensions``            — array of exactly five dimension rows in the
                              order: skill_match, seniority, salary,
                              location_remote, work_auth
* ``red_flags``             — array of ≤5 short strings (each ≤120 chars)
* ``green_flags``           — array of ≤5 short strings
* ``extracted``             — extracted facts about the JD itself —
                              title, company, location, remote_type,
                              posted_salary, summary

Each ``dimensions[*]`` row is:

```
{
  "key": "<one of the five fixed keys>",
  "status": "<from that key's status enum>",
  "rationale": "<1-2 sentences>"
}
```

Status enum per key (machine-validated server-side; if Claude returns
an out-of-set value the service nulls it):

* ``skill_match``   — ``strong``     | ``partial`` | ``gap``       | ``unclear``
* ``seniority``     — ``aligned``    | ``below``   | ``above``     | ``unclear``
* ``salary``        — ``above_target`` | ``in_range`` | ``below_target`` | ``not_disclosed`` | ``no_target``
* ``location_remote`` — ``compatible`` | ``stretch`` | ``incompatible`` | ``unclear``
* ``work_auth``     — ``compatible`` | ``blocker`` | ``unclear``

Verdict logic (Claude is told to apply this; the service does not
recompute, so trust-but-verify with negative tests):

* ``strong_fit``         — every dimension positive (skill=strong,
                            seniority=aligned, salary in {in_range,
                            above_target}, location=compatible,
                            work_auth=compatible) AND ≥2 green flags
                            AND zero red flags
* ``worth_considering``  — most dimensions positive, ≤2 stretch
                            dimensions, no work_auth=blocker, ≤1 red
                            flag
* ``stretch``            — multiple gap/below dimensions OR salary=below_target
                            OR ≥2 red flags BUT no work_auth blocker
* ``mismatch``           — work_auth=blocker OR skill_match=gap OR
                            ≥3 red flags

Why structured + rubric + verdict logic in the prompt
-----------------------------------------------------

We could compute the verdict server-side from the dimensions. We don't,
on purpose: the model has more semantic context than a rule table can
capture (e.g. "the JD says 'no sponsorship' but the operator's profile
is `citizen` — that's not a blocker"). The server still validates the
verdict is a legal enum value, but trusts the model's holistic call
within that envelope.

Profile snapshot fields the user prompt provides (verbatim, structured)
----------------------------------------------------------------------

* ``profile.summary`` — operator's resume summary (multiline)
* ``profile.seniority`` — junior/mid/senior/staff/principal/manager/director/exec
* ``profile.work_auth_status`` — citizen/permanent_resident/h1b/tn/opt/other/unknown
* ``profile.desired_salary_min`` / ``profile.desired_salary_max`` — numbers or null
* ``profile.salary_currency`` — ISO 4217 string
* ``profile.locations`` — array of strings (up to 10)
* ``profile.remote_preference`` — remote_only/hybrid/onsite/any
* ``work_history`` — array of {company_name, title, start_date, end_date, bullets[]}
* ``skills`` — array of {name, years_experience, category}
* ``jd_text`` — the JD body text the operator pasted

The model never sees the operator's raw resume PDF — only the parsed
profile fields. This bounds prompt size and prevents leaking PII into
extraction logs.
"""

JOB_ANALYSIS_PROMPT = """\
You are a precise job-fit analyst. Compare the candidate profile to the \
job description and emit a strict JSON envelope. No prose. No code fences. \
No explanation outside the JSON.

# Output schema

Return a single JSON object with EXACTLY these top-level keys (no extras):

{
  "extracted": {
    "title": "string|null",
    "company": "string|null",
    "location": "string|null",
    "remote_type": "remote|hybrid|onsite|null",
    "posted_salary_min": number|null,
    "posted_salary_max": number|null,
    "posted_salary_currency": "USD|EUR|GBP|...|null",
    "posted_salary_period": "year|month|hour|null",
    "summary": "1-3 sentence neutral summary of the role|null"
  },
  "verdict": "strong_fit|worth_considering|stretch|mismatch",
  "verdict_summary": "single sentence — what's the headline takeaway?",
  "dimensions": [
    {"key": "skill_match",     "status": "<status>", "rationale": "<1-2 sentences>"},
    {"key": "seniority",       "status": "<status>", "rationale": "<1-2 sentences>"},
    {"key": "salary",          "status": "<status>", "rationale": "<1-2 sentences>"},
    {"key": "location_remote", "status": "<status>", "rationale": "<1-2 sentences>"},
    {"key": "work_auth",       "status": "<status>", "rationale": "<1-2 sentences>"}
  ],
  "red_flags": ["short string", ...],
  "green_flags": ["short string", ...]
}

The dimensions array MUST have exactly these 5 rows in this order, with \
the exact ``key`` strings shown above. Do not add or omit dimensions.

# Status enum per dimension

skill_match status:
- "strong"   — candidate clearly covers the must-have skills/experience listed
- "partial"  — candidate covers some must-haves but is missing 1-2 important ones
- "gap"      — candidate is missing core must-haves the JD treats as required
- "unclear"  — JD is too vague about required skills to call

seniority status:
- "aligned"  — JD seniority signal (title + years required) matches profile.seniority
- "below"    — JD asks for less seniority than profile.seniority (overqualified)
- "above"    — JD asks for more seniority than profile.seniority (stretch up)
- "unclear"  — JD doesn't signal seniority

salary status:
- "above_target"   — JD posted range top is at or above profile.desired_salary_max
- "in_range"       — JD posted range overlaps the profile's desired band
- "below_target"   — JD posted range top is below profile.desired_salary_min
- "not_disclosed"  — JD does not state a range
- "no_target"      — profile has no desired_salary_min and no desired_salary_max

location_remote status:
- "compatible"   — JD location/remote_type fits profile.remote_preference and locations
- "stretch"      — JD requires onsite in a city the profile doesn't list, or hybrid
                   when the profile prefers remote_only — but feasible
- "incompatible" — JD requires onsite in a country/region the profile excludes
- "unclear"      — JD doesn't specify location or remote arrangement

work_auth status (be strict — this is how an operator avoids wasted apps):
- "compatible" — JD has no sponsorship statement, OR it explicitly welcomes
                 sponsorship, OR profile.work_auth_status is citizen / permanent_resident
- "blocker"    — JD explicitly says "no sponsorship", "must have authorization
                 without sponsorship", or "candidates requiring sponsorship will
                 not be considered" AND profile.work_auth_status is one of
                 h1b / tn / opt / other (i.e. would need sponsorship)
- "unclear"    — JD vague about work auth requirements

# Verdict logic (apply this rubric)

- strong_fit — every dimension positive (skill_match=strong, seniority=aligned,
  salary in {in_range, above_target}, location_remote=compatible,
  work_auth=compatible) AND green_flags has at least 2 items AND red_flags is empty
- worth_considering — most dimensions positive, at most 2 dimensions are
  stretch/partial/below/above, work_auth is not "blocker", red_flags has ≤1 item
- stretch — multiple gap/below dimensions OR salary=below_target OR
  red_flags has ≥2 items, BUT work_auth is not "blocker"
- mismatch — work_auth=blocker OR skill_match=gap OR red_flags has ≥3 items

If the rubric leaves the verdict ambiguous between two adjacent buckets,
prefer the LESS optimistic one (worth_considering over strong_fit; stretch
over worth_considering). Operators want honest signal, not flattery.

# Red / green flags

Red flag examples (each ≤120 characters, list ≤5):
- "comp range not posted — research before interviewing"
- "uses 'rockstar' / 'ninja' language — culture risk"
- "scope of role undefined — could absorb 3 jobs"
- "asks for 10+ years on a 3-year-old framework"
- "unpaid take-home > 4 hours"

Green flag examples (each ≤120 characters, list ≤5):
- "explicit comp range posted in the JD"
- "describes engineering practices (CI, code review, on-call rotation)"
- "scope and team size called out in the JD"
- "mentions specific career-growth investment (mentorship, conference budget)"

Do NOT pad the lists. If you have nothing for a side, return `[]`.

# Hard rules

- Return ONLY the JSON object. No markdown fence. No prose.
- Every dimension MUST be present in the order shown above.
- Every ``status`` MUST be one of the enum values for that dimension.
- ``rationale`` must reference SPECIFIC content from the JD or profile —
  never generic statements like "good fit overall". One concrete reason per
  rationale field.
- If the JD is too short or too garbled to assess a dimension, set
  ``status`` to ``unclear`` (or ``not_disclosed`` for salary, ``no_target``
  for salary if the profile has no target) and explain why in the rationale.
- Do NOT recommend the operator does anything. Just report the fit.
- Do NOT use the candidate's name. Address them in second person if you
  must reference them ("your profile…"), but prefer impersonal phrasing.
- Numbers in ``extracted.posted_salary_*`` are plain numbers — no currency
  symbols, no commas. ``posted_salary_currency`` is an ISO 4217 code.
"""
