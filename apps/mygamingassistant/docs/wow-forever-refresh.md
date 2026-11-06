# Refreshing the WoW Forever data

The routine that keeps `/wow-forever` current with the live game. A scheduled
agent follows it; a person can follow the same steps.

`backend/scripts/wow_refresh/state.json` records the newest Blizzard post already
reviewed. Commit it with every refresh, because the scheduled agent has no other
memory between runs.

## 1. Look for anything new

From `apps/mygamingassistant/backend`:

```bash
python -m scripts.wow_refresh check
```

Exit 0 means the data is on the newest client build. Exit 10 means a newer one
exists. Any other exit is a failure: report it, don't treat it as "no update".

Then read these for posts dated after `notes_reviewed_through`:

- <https://worldofwarcraft.blizzard.com/en-us/news>: this page mixes every version
  of WoW, so read only posts that name Forever. In a WoW Weekly, read only its
  Forever section.
- <https://worldofwarcraft.blizzard.com/en-us/content-update-notes>: hotfix and
  update posts count only if they name Forever, and then only their Forever
  entries. Before launch they cover other versions, so skip them.
- <https://us.forums.blizzard.com/en/wow/c/in-development/wow-forever-beta-discussion/349>
  and any Forever forum category that replaces it. Read staff posts only.

Forum threads have a JSON form: add `.json` to `/t/<id>`, then keep the posts where
`staff` is true. Don't fetch wowhead.com, because its robots.txt blocks AI bots.

Blizzard could ship the launch build under a new product id, and `check` would still
report the old one as current. Until `wowf` has a build dated on or after launch,
read <https://wago.tools/api/builds> and look for any new 1.60.x branch.

If there's no new build and no new post, stop. No branch, no PR.

## 2. Regenerate

```bash
python -m scripts.wow_refresh apply
```

It pins the newest builds in `sources.py`, runs every generator and prints a report
of what changed, by name. A generator failing stops the run: fix the cause or leave
it for a person, and never hand-edit generated JSON.

Add `--art` when a post or the report mentions new or changed maps. Walk graphs
(`public/wow-walk`) aren't part of `apply` because they need a few GB of client
files. If terrain or buildings changed, say so in the PR and leave the rebuild
(`python -m scripts.wow_world_map.walk`) for a machine with room for it.

## 3. Update the hand-written facts

Generated data doesn't cover these:

| What | Where | After launch |
|---|---|---|
| Profession rows | `data/professions/**`, `confidence: "unconfirmed"` | confirm or correct, then update `PROFESSIONS_DATA_STATUS` |
| Gold tips | `data/gold/goldTips.ts`, `unknown` and `forever` | confirm or correct, then update `GOLD_DATA_STATUS` |
| Guide and page copy | `data/`, `pages/`, `components/` | anything a post contradicts |
| Level cap and launch date | `data/levelCap.ts` | only if Blizzard moves them |

Every change needs a source: a Blizzard post that names Forever, or the Forever
client data itself.

| Source | Use it for |
|---|---|
| Blizzard posts and staff forum posts that name Forever | Forever facts |
| wago.tools branch `wowf` | Forever facts, as "from the client": not proof of how the live game behaves |
| wago.tools `wow_classic_era`, cmangos classic-db, Pawn Classic Era weights | Only what Forever doesn't publish, and always labelled Classic on the page |
| Fan sites, including Forever-only ones like ForeverChanges | Finding something to check, never as the source |
| Beta reports and beta forum threads | Only worded as what happened in the beta |

- Label a fact as Forever-published, Classic-verified or unknown, and never present
  a Classic fact as a Forever one. `forever` on a gold tip means a Blizzard post says it.
- If nothing settles a fact, leave it unconfirmed. A guess is worse than a label.
- Never invent coordinates, ids, stat values or drop rates.
- Don't copy Questie or ForeverGuide data, which is unlicensed.
- Use the `wow-forever-expert` agent where it's available to review WoW facts.

## 4. Verify

From `apps/mygamingassistant/backend`:

```bash
pytest tests/test_wow_refresh.py tests/test_wow_food_generator.py tests/test_wow_professions_generator.py tests/test_wow_world_map_generator.py tests/test_wow_raid_consumables.py tests/test_wow_items_generator.py tests/test_wow_gear_generator.py
```

From `apps/mygamingassistant/frontend`:

```bash
npx vitest run src/games/wow-forever
npx tsc --noEmit
```

A failing route test usually means a recipe's skill values moved. Fix the
hand-picked route in `data/professions/crafting/*Route.ts`; don't loosen the test.

A failing pinned item in `test_wow_items_generator.py` means the client changed
that item or a budget table. Check the item on a Forever tooltip. If the game
shows the new numbers, update the pin and say so in the PR.

## 5. Ship

1. Branch `chore/mga-wow-refresh-<build or date>` from `main`.
2. Set `notes_reviewed_through` in `state.json` to the newest post you read.
3. Open a PR whose body has the report, each hand-written change with its source,
   and anything left for a person.
4. Once CI is green, merge with `gh pr merge <number> --squash --admin`. The repo requires a
   review that the operator has waived for this repo. Never merge with failing checks.
   Merging deploys MyGamingAssistant.

Leave the PR open and say why, instead of merging, when:

- a generator or test had to be changed to get it passing
- a recipe, zone, flight point or food was **removed**
- a post changes something the page's logic assumes (level cap, launch date, skill
  caps), not just a value
- a source is ambiguous

## 6. Check the live site

After the deploy, confirm <https://mygamingassistant.myfreeapps.org/wow-forever>
and its `/food`, `/professions`, `/gold`, `/compare` and `/map` pages load and show
the new build (on `/compare`, search an item by name and check the client build
under the result). A scheduled agent has no browser, so it can only fetch them: say that in its
report, so a person knows a hand check is still owed.
