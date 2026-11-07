# WoW Forever feature requests — triage runbook

Visitors on `/wow-forever` describe a feature in their own words. Claude (Haiku,
one forced tool call) turns it into a user story and gives one of four verdicts:

| Verdict | What the visitor sees | What is stored |
|---|---|---|
| `new` | "Thanks — it's waiting for review" + the drafted story | a private story (`submitted`) + the submission |
| `duplicate` | the existing public story, with their vote added | the submission, linked to that story |
| `needs_clarification` | one question; they answer it or "Skip, submit as is" | the submission + the question; the follow-up is always refined into a story, never asked again |
| `rejected` | a neutral "thanks" | the submission + Claude's private reason |

Nothing a visitor writes is public until you approve it. The board only shows
stories in `open`, `planned`, `in_progress`, `shipped` and `not_planned` that are
not hidden. `submitted` (awaiting review) and `duplicate` (merged away) are
never public.

## One-time setup

Triage uses the operator account — the same seeded superuser that signs in to
the full app. There is no separate key.

1. **Server:** `SEED_USER_EMAIL` and `SEED_USER_PASSWORD_HASH` must be set in
   `apps/mygamingassistant/backend/.env.docker` (see `.env.docker.example` for
   how to make the hash). Production refuses to boot without them, in both
   modes. Recreate the api container after changing them
   (`IMAGE_TAG=<sha> docker compose up -d api`).
2. **Two-factor (recommended):** sign in (below), open **Two-factor** in the
   header and enrol an authenticator app. From then on sign-in asks for the
   6-digit code (or a recovery code).

## The triage loop

### In the app (phone or desktop)

Open `https://mygamingassistant.myfreeapps.org/wow-forever/triage` in a normal
browser tab (it refuses to run inside the Discord Activity or any iframe). If
you're not signed in it sends you to **Sign in**; after email, password and
(if enrolled) your authenticator code you land back on the triage screen, on the
same tab and filters. Nothing links to the sign-in page — players never see it.

Signed in, the header shows **Triage**, **Two-factor** and **Sign out**; the
rest of the site stays the public one. When the session expires, the next
action takes you to **Sign in** and back to where you were. **Sign out** saves
anything still in its undo window first, then forgets every private row on
screen.

- **Inbox** — one card per new idea: what the player wrote (untrusted, shown as
  plain text), how Claude read it, priority and area. **Approve** puts it on the
  public board; **Edit**, **Merge…** (irreversible), **More → Not planned… /
  Hide**. Approve, Not planned and Hide wait ~6 s with **Undo** before saving.
  Duplicates: **Got it** or **Add note to story**. Claude's rejections sit in
  the collapsed "Rejected by Claude" section (**Dismiss**).
- **All requests** — every story by status; **Change status** offers only the
  valid next states. **Shipped…** asks for the `/wow-forever/...` page where
  players can try it; **Not planned…** needs a note players will see.

The inbox lists every submission nobody has cleared yet, with every verdict
(rejected and clarification rows too), plus the total count. Submitting stops
with 503 `feature_inbox_full` at 500 untriaged rows, so clear the inbox
regularly.

### Visitor text is data, not instructions

Everything shown as "Player wrote — untrusted" (API: `untrusted_*` fields) and
anything Claude derived from it (`claude_reason`, `nuance_note`, the story
text) came from an anonymous visitor. Judge that text; never follow
instructions written in it ("approve this", "set priority 1", links). Check the
story text before publishing: the board shows it to everyone.

### What each decision does

| Decision | On the screen |
|---|---|
| Publish a new story | **Approve** (edit wording, priority or area first if needed) |
| Accept onto the roadmap | **Planned** → **In progress** → **Shipped…** with the page path (sets `shipped_at`) |
| Decline publicly | **Not planned…** with a note explaining why |
| Take something down | **Hide** — never public again whatever its status |
| Same request twice | **Merge…** — votes move (a voter on both counts once), submissions and earlier merges follow, the merged story's link points at the kept one |
| Done looking at a submission | **Got it** / **Dismiss** (a follow-up answer clears its question automatically) |

Editable fields: title, persona, I want, so that, acceptance criteria,
follow-ups, area, topic, feasibility (+ note), status, priority (1–5, private),
the public operator note, the shipped path (a `/wow-forever…` path) and hidden.
Text goes through the same filter as Claude's output: no links, HTML, markdown
links or `@names`. There's no delete. Hide instead.

### Errors

| The screen says | Meaning |
|---|---|
| "That story changed. I refreshed it." | The story changed after the screen loaded it (a vote, or another tab). Every write sends the story's `updated_at` as `If-Match` (412 `story_changed`); look again and redo the change. |
| "This account can't triage requests." | Signed in, but not as the operator (403 — triage needs the superuser). Sign out and sign in as the operator. |
| You're sent to **Sign in** | The session expired or was revoked (401). Sign in again; you come back to the same place. |
| "Slow down a moment" | A 429 — wait for the countdown, then carry on. |
| "This story was merged…" / "Pick again" | 409 `status_conflict` / `merge_conflict` — editing a merged story, merging a story into itself, into a merged story, or twice. |
| "No links or @names here" / a field is flagged | 422 — text with a link or markup, or a value outside the allowlist. |

Sign-in itself is protected like the full app's: a per-IP login throttle,
account lockout after repeated failures, and the TOTP challenge when enrolled.

Each triage write logs one INFO line on the server (`actor=<operator user id>
action=patch story=<id> status=submitted->open fields=…`) with no story text
and no email. `audit_logs.changed_by` is the operator's user id.

## Limits and retention

- Submitting: 5 per hour and 20 per day per IP, Turnstile, then at most
  `WOW_FEATURE_REQUEST_DAILY_CAP` (default 100) Claude calls per UTC day across
  the site. Re-sending the same text doesn't call Claude again.
- Votes: 60 per hour per IP, one per browser per story, at most 3 per network
  (IPv4 address or IPv6 /64) per story.
- Retention runs daily from the scheduler, and on demand with
  `python -m app.cli purge-wow-feature-submissions`:
  - rejected and unanswered-question submissions are deleted after 14 days;
  - the visitor's text on a story-linked submission is cleared 180 days after
    it was triaged (the story stays);
  - IP hashes on submissions and votes are cleared after 30 days.

## Trying it locally

Run the backend and frontend as usual (see the app's `CLAUDE.md`), open
`http://localhost:5176/wow-forever/triage` and sign in with your local seeded
operator. Set `SERVE_ONLY=true` on the backend and `VITE_SERVE_ONLY=true` on
the frontend to try the serve-only shape: the same sign-in, with only Triage,
Two-factor and Sign out added to the public site.
