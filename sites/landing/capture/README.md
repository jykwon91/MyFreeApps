# Portfolio screenshot capture

Regenerates the four screenshots in `../public/jason/img/` used by
`myfreeapps.org/jason/`. It runs locally only, not in CI.

| Image | Source |
| --- | --- |
| `mygamingassistant.webp` | Production. MyGamingAssistant is public, so no account is involved. |
| `mybookkeeper.webp`, `myjobhunter.webp`, `myrecipes.webp` | Local copies of each app, seeded with a fictional demo account ("Alex Rivera", `demo@example.com`). |

**Never capture these three apps from production** — real people's finances, job searches and recipes live there.

## When to re-run

Re-run whenever a screenshotted screen changes:

- the MyBookkeeper transaction side panel;
- MyJobHunter resume refinement;
- the MyRecipes version diff;
- the MyGamingAssistant map page.

Re-run as well if an app's look changes enough that the image is stale.
Commit the new `.webp` in the same PR as the change.

## Prerequisites

Each app runs from this checkout against its own throwaway database (`portfolio_demo_mbk`, `portfolio_demo_mjh`, `portfolio_demo_myrecipes`). Point each app's gitignored `apps/<app>/backend/.env` at that database. The seeds read `DATABASE_URL` from there, and `local-db.ts` refuses any database not named `portfolio_demo_*`.

| App | Backend | Frontend (`VITE_API_TARGET` → backend) |
| --- | --- | --- |
| MyBookkeeper | `:8010` | `:5190` |
| MyJobHunter | `:8011` | `:5191` |
| MyRecipes | `:8012` | `:5192` |

Each backend also needs:

- local Postgres and MinIO;
- `alembic upgrade head` run against its demo database;
- a real `ANTHROPIC_API_KEY`, the first time only — the seeds run real extraction, JD parsing and resume refinement once, then reuse the results.

MyBookkeeper sends a verification email on registration through real SMTP. On a fresh database, point `SMTP_HOST`/`SMTP_PORT` at a local SMTP sink.

Override the URLs with `MBK_URL`, `MJH_URL` and `MYRECIPES_URL`, and the demo password with `DEMO_PASSWORD`.

## Run

From `sites/landing`:

```bash
npx playwright test --config capture/playwright.config.ts                 # seed, then capture all four
npx playwright test --config capture/playwright.config.ts --project=seed  # seed only
npx playwright test --config capture/playwright.config.ts --project=capture --no-deps -g MyJobHunter  # re-capture one
```

The seeds are idempotent: they only create what is missing. The MyJobHunter refinement session keeps the state it was first seeded with, so the hallucination-guard exchange stays on screen.

Look at every image you regenerate before committing it.
