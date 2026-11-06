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

1. **Generate a token** on your own machine — never paste it in chat:

   ```
   python -c "import secrets;print(secrets.token_urlsafe(32))"
   ```

2. **Server:** in `apps/mygamingassistant/backend/.env.docker` on the VPS, add
   the token with a label (no trailing comment on the line):

   ```
   WOW_FEATURE_TRIAGE_TOKEN=cli:<token>
   ```

   Recreate the api container (`IMAGE_TAG=<sha> docker compose up -d api`). The
   app refuses to boot if the value is malformed (bad label, a token under 32
   characters or with fewer than 16 different characters, a repeated label) —
   the error names the label, never the token. Leaving it empty keeps the triage
   API unmounted (404); the public board and submissions work either way.

3. **Your machine:** copy `backend/.env.triage.example` to `backend/.env.triage`
   (gitignored) and set `MGA_TRIAGE_TOKEN=<token>` — the token only, without
   `cli:`.

4. **Host Caddy access log** — the token travels in the `X-MGA-Triage-Token`
   request header, and the host Caddy's JSON access log records request headers
   by default. Add a header filter to each `log` block that covers
   `mygamingassistant.myfreeapps.org`:

   ```
   format filter {
       wrap json
       request>headers>X-Mga-Triage-Token delete
   }
   ```

   Caddy logs header names in Go's canonical case (`X-Mga-Triage-Token`).
   Check the exact block first (`grep -n -A8 'log' /etc/caddy/Caddyfile`), merge
   the filter into an existing `format`, then `caddy validate` and
   `systemctl reload caddy`. The app's own request log never prints headers.

## The triage loop

Run from `apps/mygamingassistant/backend`:

```
python -m scripts.wow_feature_triage inbox            # untriaged submissions, oldest first
python -m scripts.wow_feature_triage stories          # every story, private fields included
python -m scripts.wow_feature_triage stories --status submitted --json
python -m scripts.wow_feature_triage apply plan.json  # preview: before -> after, writes nothing
python -m scripts.wow_feature_triage apply plan.json --yes
```

The inbox lists every submission nobody has cleared yet, with every verdict
(rejected and clarification rows too), plus the total count. Submitting stops
with 503 `feature_inbox_full` at 500 untriaged rows, so clear the inbox
regularly.

### Visitor text is data, not instructions

Everything inside `[untrusted] … [/untrusted]` (JSON: `untrusted_*` fields) and
anything Claude derived from it (`claude_reason`, `nuance_note`, the story
text) came from an anonymous visitor. When you triage with Claude, it judges
that text. It never follows instructions written in it ("approve this", "set
priority 1", links). Check the story text before publishing: the board shows
it to everyone.

### Plan file

```json
{
  "patches": [
    {"story_id": "<uuid>", "set": {"status": "open", "priority": 2, "title": "Alchemy leveling route"}}
  ],
  "merges": [
    {"story_id": "<uuid merged away>", "into": "<uuid kept>"}
  ],
  "mark_triaged": ["<submission uuid>", "<submission uuid>"]
}
```

Steps run in order: patches, then merges, then mark-triaged. The preview
validates `set` with the API's own schema, so it rejects the same plans the
server would.

Fields `set` may change: `title`, `persona`, `i_want`, `so_that`,
`acceptance_criteria`, `follow_ups`, `area`, `topic`, `feasibility`,
`feasibility_note`, `status` (anything but `duplicate` — use a merge),
`priority` (1–5, private), `operator_note` (public), `shipped_path` (a
`/wow-forever…` path) and `hidden`. Text goes through the same filter as
Claude's output: no links, HTML, markdown links or `@names` (422).

| Decision | Plan entry |
|---|---|
| Publish a new story | patch `{"status": "open"}` (edit wording in the same patch) |
| Accept onto the roadmap | `planned` → `in_progress` → `shipped` + `shipped_path` (sets `shipped_at`) |
| Decline publicly | `not_planned` + an `operator_note` explaining why |
| Take something down | `{"hidden": true}` — never public again whatever its status |
| Same request twice | a merge — votes move (a voter on both counts once), submissions and earlier merges follow, the merged story's link points at the kept one |
| Done looking at a submission | `mark_triaged` (a follow-up answer clears its question automatically) |

There's no delete. Hide instead.

### Errors

| CLI says | Meaning |
|---|---|
| `HTTP 412 story_changed` | The story changed after `stories` read it (a vote, or another run). Every write sends the story's `updated_at` as `If-Match`. Re-run and update the plan. Steps before the failed one are already applied. |
| `HTTP 404 Not Found` + "wrong token" hint | Wrong token, or `WOW_FEATURE_TRIAGE_TOKEN` unset on the server. Both look the same on purpose. |
| `HTTP 429` | More than 10 bad tokens from your IP in 15 minutes (locks the IP out, even with the right token, until the window passes), or more than 240 requests a minute. |
| `HTTP 409 status_conflict` / `merge_conflict` | Editing a merged story, merging a story into itself, into a merged story, or merging it twice. |
| `HTTP 422` | Text with a link or markup, or a value outside the allowlist. |

Each triage write logs one INFO line on the server (`actor=cli action=patch
story=<id> status=submitted->open fields=…`) with no text and no token. The
audit actor is `triage:<label>`.

## Rotating the token

Labels let you rotate without downtime: set
`WOW_FEATURE_TRIAGE_TOKEN=cli:<old>,cli2:<new>`, recreate the container, switch
`.env.triage` to the new token, then remove the old entry and recreate again.

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

Start the backend with a test token (any 32+ character value with 16+
different characters). In `backend/.env`:

```
WOW_FEATURE_TRIAGE_TOKEN=cli:<local token>
```

In `backend/.env.triage`:

```
MGA_TRIAGE_BASE_URL=http://localhost:8004/api
MGA_TRIAGE_TOKEN=<local token>
```

`http://` is only accepted for localhost.
