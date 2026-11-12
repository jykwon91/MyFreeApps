# MyGamingAssistant — CLAUDE.md

## Project

**MyGamingAssistant** — a single-user, self-hosted lineup and utility management tool
for tactical FPS games (Valorant, CS2). Core value: store and visualize lineup throws
overlaid on game minimaps. Also hosts **companion** games — static per-game pages
with no maps (currently World of Warcraft: Forever: a World Map, profession leveling
guides, item compare, gold tips and more). Part of the MyFreeApps monorepo.

**Single-user app:** There is NO `/register` route. The operator account is seeded at
boot time from `SEED_USER_EMAIL` + `SEED_USER_PASSWORD_HASH` env vars. Production boot
fails loudly if those vars are missing.

## Canonical App

**MyBookkeeper is the canonical app.** MyGamingAssistant mirrors MBK for all Tier-1
and Tier-2 infrastructure byte-for-byte (auth, security, Docker, Caddy, deploy workflow)
except for:
- App name, ports, and domain
- Single-user design (no /register route, seed user from env)
- Domain models (Game, Map, MapZone, Site, UtilityType, Source, Lineup, etc.)

Before adding any infrastructure feature to MGA, open the matching MBK file first.

## Stack

| Layer | Tech |
|---|---|
| Backend | FastAPI, Python 3.12, SQLAlchemy 2.0 (async), PostgreSQL 16, Alembic, Pydantic 2 |
| Auth | fastapi-users, JWT Bearer |
| AI | Anthropic Claude SDK (future phases) |
| Shared infra | `packages/shared-backend/platform_shared` |

## Directory Map

```
apps/mygamingassistant/
├── backend/
│   ├── alembic/               DB migrations
│   ├── app/
│   │   ├── api/               Flat route handlers (thin — delegate to services)
│   │   ├── cli/               CLI entrypoint — python -m app.cli load-fixtures
│   │   ├── core/              Config, auth, enums, security, permissions
│   │   ├── db/                Session factory + Base (re-exports from platform_shared)
│   │   ├── fixtures/          JSON fixture files (games, maps, utility types)
│   │   ├── models/            Domain-per-directory ORM models
│   │   ├── schemas/           Domain-per-directory Pydantic schemas
│   │   └── services/          Business logic services
│   └── tests/
├── desktop/                   Reserved — Tauri shell (Phase 7)
├── docker/
├── docker-compose.yml
└── CLAUDE.md
```

## Port Assignments

| Service | Port |
|---|---|
| Caddy (docker) | 8096 (host) → :80 (container) |
| Backend (uvicorn) | 8004 |
| Frontend (dev) | 5176 |
| PostgreSQL (dev) | see docker-compose.yml |

Domain: `mygamingassistant.myfreeapps.org`

## Domain Models

### Game domain
- `game` — slug + name + `kind` + side labels (attacker/defender or T/CT)
  - `kind` is `lineups` (map/lineup library) or `companion` (static feature pages,
    no maps — WoW Forever). CHECK `ck_game_kind`.
  - Side labels are nullable; `ck_game_lineup_side_labels` requires them on
    `lineups` games. The classifier's reference data only lists `lineups` games.
- `map` — belongs to game; slug + name + minimap URL
- `map_zone` — polygon overlay zones on a map (A main, B site, etc.)
- `site` — bomb sites / objective sites on a map
- `utility_type` — per-game utility types (smoke, flash, molotov, recon, etc.)

### Lineup domain
- `source` — a throwing position on a map for a utility
- `lineup` — A → B trajectory (source + destination zone/site, side, description)
- `lineup_package` — named collection of lineups
- `lineup_package_lineup` — M2M join

## Per-game features (game registry)

A lineup game uses the generic pages under `/:gameSlug`. A companion game owns its
own pages, registered in `frontend/src/games/registry.ts` and routed by
`frontend/src/games/<slug>/routes.tsx`, which `src/routes.tsx` mounts BEFORE
`/:gameSlug`. `GameGrid` links every card through `getGameLandingPath()`. Game
pickers in the lineup library use `useLineupGames()` so companion games never
appear where a map must be chosen.

To add a companion game: a `kind: "companion"` row in `app/fixtures/games.json`,
a registry entry, and a `src/games/<slug>/` folder (data, components, pages, routes).

### WoW Forever (`/wow-forever`, `/wow-forever/items`, `/wow-forever/items/:id`, `/wow-forever/map`, `/wow-forever/professions`, `/wow-forever/food`, `/wow-forever/gold`, `/wow-forever/auction-house`, `/wow-forever/compare`, `/wow-forever/gear`, `/wow-forever/macros`, `/wow-forever/dungeons`, `/wow-forever/rares`, `/wow-forever/library`, `/wow-forever/legacy`, `/wow-forever/races`, `/wow-forever/races/:race`, `/wow-forever/talents`, `/wow-forever/spellbook`, `/wow-forever/trainers`, `/wow-forever/downrank`, `/wow-forever/changes`, `/wow-forever/server-status`, `/wow-forever/ask`)

- All public, static, frontend-only. Content is typed data under
  `src/games/wow-forever/data/` — don't state Forever facts that aren't published.
- Cooking & Fishing (`/wow-forever/professions`, `?p=cooking|fishing`) is
  hand-written data in `data/professions/`, researched in the beta and
  re-checked against the launch client on 2026-11-05: every row carries
  `confidence: "confirmed" | "unconfirmed"`. Rows still unconfirmed depend on
  server-side facts (trainers, vendors, quests, fishing zones) — confirm them
  in game or from a Blizzard post, then bump `PROFESSIONS_DATA_STATUS.checkedOn`.
- **Provenance badges — the ONE "where is this from" system.** Every fact that
  needs a source tag uses `components/shared/ProvenanceBadge.tsx` (a button:
  hover, keyboard focus or a tap shows what the tag means; Escape / a tap
  elsewhere closes it). Categories are `types/provenance/provenance.ts`; labels,
  descriptions, order and details live only in `data/provenance/provenanceLabels.ts`:
  "Seen in game" (+ date, addon captures), "Official" (Forever team posted it),
  "Game files" (the Forever client — never for server-side facts like
  trainers, vendors, drops), "Classic data" (Classic Era, may differ) and
  "Unconfirmed" (dashed; beta reports land here). Data fields stay as they are;
  small pure mappers in `lib/provenance/` turn them into a tag
  (`confidenceProvenance`, `goldProvenance`, `poiProvenance`,
  `gearSourceProvenance`, `itemSectionProvenance`). Badges are neutral
  outlines — icon + word, never colour. In a tagged list a row with no badge
  has been checked against Forever. `ProvenanceGuide` ("How to read these
  tags") renders under every WoW page via `withLegalNotice`. Never add a
  second chip, label string or "may differ in Forever" sentence — tag the fact
  instead. Not provenance (keep separate): "Source unknown", route-type
  badges, Compare's input-method note, auction price credits.
- Professions also has crafting guides (`?p=alchemy|blacksmithing|enchanting|engineering|leatherworking|tailoring|firstaid`,
  `&skill=N`, `&spec=<choice>`). The picker (`data/professions/professionPicker.ts`) groups
  Crafting vs Gathering vs Secondary; `isCraftingProfession` / `parseGuideProfession`
  (`lib/guideProfession.ts`) are the only list of what's crafting — never
  hard-code profession keys. **First Aid** is listed under Secondary but is a
  `CraftingProfession` (it renders `CraftingGuideView`): bandage-only route;
  its Expert rank is a book (`kind: "book"`, vendors per faction) and Artisan
  the Triage quest (`kind: "quest"`), both with a per-faction boat-trip note
  and Directions (`data/professions/crafting/firstAidTrainers.ts`). Forever
  moved the healing potions from Alchemy to First Aid. What each guide shows is
  `crafting/craftingFeatures.ts`: only `priced` professions (Tailoring,
  Enchanting) get the prices panel (overrides) / cheapest route; the rest show
  the hand-picked route, costed at auction prices, never called "cheapest".
  Recipes Forever added and no Classic source teaches get a "Source unknown"
  chip and never a Classic trainer (`sourceUnknown`, `learnAt.newInForever`).
  **Recipe vendors** (every guide but gathering; `components/recipeVendors/`,
  pure logic in `lib/recipeVendors/`, `wowRecipeVendors.test.ts`): a "Recipe
  vendors" section (`#vendors`, Classic data badge) lists every vendor-sold
  recipe grouped by vendor — name · title, place · coords, faction, distance
  from the World Map's saved zone/position (`zoneToWorld` + `yardsBetween`;
  other continent = "boat or zeppelin"), price (cmangos `BuyPrice`, written as
  `price` on a source only when someone sells it), limited stock and
  `directionsHref`. Your faction + neutral first, the other faction behind a
  toggle. Route rows whose recipe you buy get a "Buy X from <nearest vendor>"
  line (`RecipeBuyLines`): crafting rows from `learnAt`, Cooking rows from
  `CraftStep.recipes` (food ids), and a `buysBook` milestone from the rank
  book in `recipeSources.json` `books` (`RANK_BOOKS` in `wow_food/build.py`:
  Expert Cookbook, Expert Fishing). A recipe with no Classic vendor is never
  given one.
  **Rank trainers** (Journeyman / Expert / Artisan): a crafting rank-up and the
  Cooking / Fishing milestones (`teaches`) list EVERY trainer who teaches the rank
  to your faction (neutral too), capitals first, the World Map zone you saved
  first (`RankTrainerList`, `data/professions/rankTrainers.ts`), each with a map
  link and a Classic data badge. **GENERATED** by
  `python -m scripts.wow_world_map.rank_trainers` (cmangos `npc_trainer` rank
  spells + the committed services/zones; in `wow_refresh`) into
  `data/worldMap/classic/classicRankTrainers.json`. A milestone's `npc` names the
  book seller / quest giver (`MilestoneWhere`). Tests:
  `tests/test_wow_rank_trainers_generator.py`, `src/__tests__/wowRankTrainers.test.ts`.
  Herb / ore nodes carry their gathering skill (Forever `Lock` table) in the
  `objectSpots` rows. Each guide has trainers, rank-ups (Artisan Enchanting = Annora in Uldaman), a
  hand-picked route to 300 (`data/professions/crafting/*Route.ts`, joined to
  the recipe data by spell id — `wowCraftRoute.test.ts` checks it runs 1→300
  with no gaps, never past a rank cap, never crafting a recipe at grey or
  before it can be learned), expected crafts per row (Classic skill-up
  formula, `crafting/craftRoute.ts`) and a shopping list (bolts / motes the
  profession makes itself are expanded into raw materials). The skill lives in
  `?skill=` (wins for that visit) and `mga.wowForever.professions.skill.v1`.
  **Specializations** (Blacksmithing, Leatherworking, Engineering; `data/professions/crafting/craftingSpecs.ts`,
  `crafting/craftSpecs.ts`): a decision row at the fork, and a spec picker that
  filters the route's options by `recipe.spec` ("Not chosen yet" shows all,
  each with a chip). Kept in `?spec=` (wins for that visit) and per profession
  in `mga.wowForever.professions.spec.v1`. Spec quests, skills and levels are
  Classic. **Smelting**: a miner's profession (`SMELTS_FOR` in `build.py`) gets
  `smelting` in its JSON, and the shopping list counts ore, not bars.
  **Skinning**: leather and hides carry `skinning.mobs` (a beast per best zone,
  its densest pack, else the beasts themselves) with Directions; leather you
  skin is never expanded into the scraps Leatherworking could make it from.
  **Item lines** (Engineering; `effects` in `craftingFeatures.ts`): each recipe
  carries `effect`, its item's Forever tooltip (`wow_professions/effects.py`;
  rolled amounts read "26 to 34" from SpellEffect `Variance`, as the game
  prints them); a part with no tooltip reads "A part for other ... recipes"
  (`crafting/craftEffect.ts`), anything else shows nothing.
  **Recipe data is GENERATED** — `python -m scripts.wow_professions.build`
  (from `backend/`) writes `data/professions/crafting/{tailoring,enchanting,alchemy,blacksmithing,leatherworking,engineering,firstaid,mining}.json`
  (`mining.json` = Mining's own smelts + camp items, with each smelt's `focus`)
  (with `smelting` / `specs` where they apply; teaching items are found by
  prefix — Pattern/Formula/Recipe/Plans/Schematic/Manual — and by the
  profession's skill line or its Forever child lines, e.g. First Aid's 2942)
  from the Forever client, plus `classic/trainerSkills.json` and
  `classic/sources.json` (cmangos GPL — keep LICENSE + README).
  `tests/test_wow_professions_generator.py`, `tests/test_wow_engineering_generator.py`. A route row that names a spell
  missing from the data throws, so re-run the route test after regenerating.
- **Gathering guides** (`?p=mining|herbalism|skinning`, `&skill=N`; the picker's Gathering group,
  `isGatheringProfession`): `components/gathering/GatheringGuideView.tsx`
  switches on the guide's `kind` (`GatheringGuide` = `NodeGatheringGuide` |
  `MobGatheringGuide`); both share `GatheringGuideLayout` + `useGatheringLoad`.
  **Skinning** is the `mobs` kind: "What can I skin right now?" = beast levels
  `[max(1, cap−5), cap]`, cap = min(Classic max skinnable level, your level + 2)
  (`gathering/skinLevels`, `skinBand`, `rankSkinningZones`; `wowSkinning.test.ts`),
  2–3 zones off hostile ground with each beast's densest pack + Directions, and a
  leather-by-level table. Its data is `crafting/classic/skinning.json` (cmangos,
  GENERATED by `build.py` via `wow_food/skinning_sources.py`). Never state a
  tagging rule or gathering perks. Node guides, in
  this order — "What can I mine right now?" (skill box, a capped banner at
  75/150/225 naming the nearest trainer, the orange/yellow nodes + next unlock,
  2–3 zones ranked by Forever's `zones.json` levels with Directions; zones above
  you go last), Get started, route, Forever changes, then the collapsed node
  table and smelting. Pure logic in `gathering/` (`nodeColors`, `gatherNow`,
  `rankZones`, `rankCaps`, `nearestTrainer`; `wowGathering.test.ts`). A node's
  required skill is the Forever `Lock` skill on its `objectSpots` (a node with
  none throws); yellow/green/grey offsets, ranks, spawns and trainer spots are
  Classic and labelled so. Each row's chip says what it rests on
  (`ForeverChange.basis` → `confidenceProvenance`: a beta report is
  Unconfirmed, a Classic route or rule is Classic data). A new gathering profession = a key in `GATHERING_PROFESSION`,
  an option in `GATHERING_GROUP` and a `GATHERING_GUIDES` entry
  (`data/professions/gathering/`); its trainers join the World Map trainer test
  automatically. The skill shares `mga.wowForever.professions.skill.v1`.
- Making gold (`/wow-forever/gold`, `?band=1-20|20-40|40-60|all`, seeded from
  the World Map's saved level) is hand-written advice in `data/gold/goldTips.ts`:
  each tip is `classic` (Classic data badge), `forever` (published for
  Forever — Official) or `unknown` (Unconfirmed; client-only facts stay here,
  worded "the Forever client …"; `goldProvenance`). The tips never state gold amounts — a test fails on any
  "N gold/silver" in them; the farm cards' cloth / leather values come from
  auction prices only. Class tips follow the saved World Map class; the page's Class picker saves to it. Its checklist has its own
  key (`mga.wowForever.gold.checklist.v1`).
- **Auction-house prices** (`GET /api/wow/prices?server=pvp&faction=alliance|horde|neutral`,
  public, both modes; no server = `pvp`, no faction = Alliance, an unmapped
  server or unknown faction = 422) are the real in-game auction houses, **one
  house at a time**, from Blizzard's Game Data API — the only price source
  (migration 0052 dropped the old one and emptied the tables). **US only**
  (operator decision 2026-11-08): no region param, an old `?region=` is
  ignored. Flow (`app/services/wow/prices/`, constants in
  `app/core/wow_prices.py`): a client-credentials token
  (`BLIZZARD_CLIENT_ID` / `BLIZZARD_CLIENT_SECRET` — never log them) → the
  ruleset's auction-house index (`namespace=dynamic-forever-us`, every
  ruleset lists the same houses; a house's name gives its faction,
  `HOUSE_NAME_FACTIONS`, Blackwater = `neutral`) → each **mapped** house's
  listings + `/commodities`. **Each house is its own server market — never
  pool houses** (Blue Pearl was ~31s on one Alliance house and ~40s on
  another). The index comes in triples (alliance, horde, neutral):
  110/113/116, 111/114/117, 112/115/118, 119/120/121, 123/124/125, with no
  server names. `PRICE_SERVER_HOUSES` maps a server to its triple — only
  `pvp` → 110/113/116 is mapped (verified in game 2026-11-09: Blue Pearl
  ~40s, Stonescale Eel ~4s on PvP Alliance). The other triples are
  **UNMAPPED**: never fetch, serve or label them on a guess. **To map a
  server:** the operator reads an item's price on that server in game, runs
  `python -m app.cli wow-house-prices <item id>` (e.g. 4611 Blue Pearl,
  13422 Stonescale Eel — it lists every house's cheapest listing and 10%
  value, mapped or not), picks the triple that matches, then adds the key
  to `PRICE_SERVER_HOUSES` and `PriceServer` (backend) and to
  `PRICE_SERVERS` / `PRICE_SERVER_LABEL` / `PriceServer` (frontend
  `data/priceServers.ts`, `types/priceServer.ts`). No migration: the feed
  is keyed by house id. Once two servers are mapped, add a server picker.
  Only aggregates are stored, per item: `market_value` = the unit price
  below which the cheapest 10% of the listed units sit
  (`MARKET_VALUE_QUANTILE`; one troll listing can't move it — **the price to
  show**), `min_buyout`, `quantity`, `listing_count`. Tables `wow_price_feed`
  (one per game × region × `house_id`, with its `faction`:
  `source_updated_at` = Blizzard's snapshot of that house, `fetched_at`,
  last error) and `wow_item_price` (copper). The
  scheduler job `refresh_wow_prices` runs every
  `WOW_PRICE_REFRESH_INTERVAL_HOURS` (default 3) and once at boot, with a
  switch of its own (`WOW_PRICE_REFRESH_ENABLED`, default true) — serve-only
  prod runs `SCHEDULER_ENABLED=false`, which turns off only the source jobs
  (sync, download cleanup, raid reminders), never the prices. Production with
  it on refuses to boot without the Blizzard credentials
  (`check_blizzard_prices_configured`). A refresh is all-or-nothing per
  house: a failed call, a house that suddenly has no listings, or a mapped
  house the index lists under another faction (or not at all) keeps the
  stored set, records the error on the feed and logs a WARNING with
  Blizzard's HTTP status and error code. A per-game advisory lock makes an
  overlapping run (scheduler + CLI) skip. `python -m app.cli refresh-wow-prices`
  does it by hand. The response is columnar (`columns` = `item_id`,
  `market_value`, `min_buyout`, `quantity`, `listings`, `name`), carries
  `server` + `faction`, with a per-house ETag and `max-age=600`. No rows =
  no prices yet, never "free". Any page showing a price says whose house it
  is: "Prices from Blizzard (PvP · Alliance AH, US) · updated X".
- **Macros** (`/wow-forever/macros`, `pages/WowMacrosPage.tsx`): how-to, then "Hover-cast macros
  (mouseover)" (three templates in `data/macros/macroTemplates.ts`, filled live
  from a "Your spell name" box by `lib/macros/macroTemplates.ts`; empty =
  `Spell Name`), then "Tag a mob first" (`components/macros/TagMacroSection.tsx`,
  `#tag` jumps there via `hooks/useScrollToHashOnLoad.ts`, linked at the top):
  paste mob names (one per line, max 5, `lib/macros/tagMacro.ts` `parseMobNames`)
  → `#showtooltip` + `/cleartarget` + `/targetexact` per name + `/stopmacro
  [noexists][dead]` + optional skull (`SetRaidTarget`) + `/cast` (default
  Corruption, editable); warns past 255 characters. Then ready-made macros for every class. Data in
  `data/macros/`: `hoverCastMacros.ts` (template + spell, every class) and
  `warlockMacros.ts` (hand-written). `lib/macros/macroCatalog.ts` groups them
  by class then kind (`macroKinds.ts`, hover cast always first). Class picker:
  `?class=` wins, else `mga.wowForever.macros.class.v1`, else all classes
  (`hooks/useMacroClassFilter.ts`). The old `/wow-forever/warlock-macros`
  redirects to `/wow-forever/macros?class=warlock`.
  `wowMacros.test.ts` checks every macro's spell/item names against
  `data/macros/macroNames.json`, **GENERATED** by
  `python -m scripts.wow_macros.build` (each class's talent-tree skill lines,
  owner checked by `SkillRaceClassInfo.ClassMask`, Warlock pet lines, the
  wand's `Shoot`, Healthstone/Soulstone items and healing potions; re-pinned
  by `wow_refresh`). Trainer spells only — no talents. Max 255 chars per
  macro. Syntax Forever may not support (`@focus`, `/castsequence`,
  `/stopcasting`, pet `/cast`, `!` keep-on, `[mod:]`, `[nopet]`, `%t` in chat)
  carries an `unconfirmed` tag and the Unconfirmed badge — never claim in-game
  testing. Forever renamed Curses to Banes (no Curse of Agony). No addon, no
  Wowhead links.
- Class/spec ids in `data/classes.ts` are the stable key for anything
  class-shaped (stat weights, compare settings, a future BiS page). Never rename.
- **Scoring lives in the frontend** (`scoring/`), deterministic and unit-tested.
  Level 60 weights: Pawn's Classic Era scales (HawsJon) in
  `data/weights/pawnClassicWeights.ts` — the header cites the source commit.
  Leveling: documented heuristic in `levelingWeights.ts`. Stats a spec has no
  weight for are shown as "not scored", never silently 0.
- Pasted tooltip text is parsed in the browser (`parsing/`), so compare works
  signed out and in the serve-only deployment.
- Screenshot reading calls `POST /api/wow/items/extract` (Claude tool-use, nothing
  stored). It is PUBLIC and mounted in BOTH modes (serve-only prod included),
  gated in order by: availability (503 `item_reader_unavailable` when
  `ANTHROPIC_API_KEY` is unset, `WOW_EXTRACT_DAILY_CAP<=0`, or — serve-only /
  production — `TURNSTILE_SECRET_KEY` is unset) → per-IP limit (20/h) →
  shared Turnstile dependency (`X-Turnstile-Token`) → input validation →
  durable global daily cap (`daily_usage_counters`, platform_shared
  `try_consume_daily_quota`; 429 `item_reader_daily_limit_reached`). No boot
  guard — an unconfigured reader degrades to 503 and the UI to manual entry.
  The frontend only offers it in serve-only builds when `VITE_TURNSTILE_SITE_KEY`
  is baked into the bundle (GitHub Actions variable
  `MYGAMINGASSISTANT_VITE_TURNSTILE_SITE_KEY`).
- The reader's tool call transcribes the tooltip first (`tooltip_lines`, stopping
  at the game's "If you replace this item" comparison); `item_response_mapper`
  drops any stat whose number isn't on those lines, with a warning. The UI
  (`ScreenshotReader`) takes a screenshot by a "Paste screenshot" button
  (Clipboard API), Ctrl+V in the focused box, file or drop — and keeps the
  image on screen before and after reading so it can be checked.
- Stat keys / slots / qualities exist on both sides —
  `tests/test_wow_stat_keys_parity.py` fails CI on drift.
- **"Search by name"** (the default input tab) searches
  `data/items/items.json`, **GENERATED** by `python -m scripts.wow_items.build`
  (from `backend/`; never hand-edit) from the Forever client's ItemSparse
  (uncommon+ items with stats). **Most Forever items exist only as server
  hotfixes** (the client file has ~19k of ~32k item rows; Hand of Justice and
  most Classic gear aren't in it), so `wow_items/forever_items.py` layers the
  client file, wago.tools' hotfix export (`useHotfixes=1`) and the operator's
  own client cache `DBCache.bin` (`hotfix_cache.py` + `dbd.py`, decoded with
  WoWDBDefs; the cache wins, being the server's newest answer). Items and gear
  builds take `--hotfix-cache` / `WOW_FOREVER_HOTFIX_CACHE` and stop when it's
  missing. Items no client has seen yet stay out; never fill them from the
  Classic Era client (Forever re-itemized). Stats = `RandPropPoints[ilvl].<Quality>F_<slot>
  × StatPercentEditor / 10000` (round half up); armor = ItemArmorTotal ×
  ArmorLocation × ItemArmorQuality (+ QualityModifier; shields from
  ItemArmorShield); weapon damage = the ItemDamage* table's DPS × speed,
  spread by `DmgVariance`. Damage is left blank (`damageUnknown`, "enter it from your
  tooltip") for caster weapons (`Flags_4 & 0x100`), legendaries and non-wand
  weapons with spell stats — the formula is wrong for those. Random-suffix
  items (`classic/randomSuffixItems.json`, cmangos GPL — keep LICENSE +
  README) have no stats in the list and say so. Client stat ids map in
  `scripts/wow_items/client_ids.py`; unmapped ones count as "other effects".
  `tests/test_wow_items_generator.py` pins items checked against Forever
  tooltips — a failing pin means the client changed. The file is fetched as a
  same-origin asset (`?url`, `lib/clientItemsLoader.ts`, one load shared by
  every card) so it works in the Discord Activity; a picked item keeps its
  game-file numbers as `origin.baseline`, so edits are marked and can be reset.

#### Hub (`/wow-forever`, "Overview")

- Under the header: "Game data: patch 1.60.1 (build 70790) · updated <date>" from
  `data/dataRefresh.json`, **written by `wow_refresh apply`** (never by hand; a
  backend test checks its build matches `sources.WAGO_BUILD`).
- **What's new on this site** (`data/whatsNew.ts`, hand-written, newest first,
  date = the day it merged): the latest `WHATS_NEW_HUB_COUNT` (5) + "Show all".
  Add an entry in the same PR as any player-visible change. An entry's `to` path
  (query dropped) must be the hub or a hub tile — that page gets the dot.
- **Update dots** on hub tiles and their left-nav items (`NavItem.dotLabel` in
  `@platform/ui`): a page with an entry the browser hasn't seen. Seen entries
  (by `entryKey` = date + title, never by time, so a same-day ship still dots)
  live in `mga.wowForever.pageVisits.v1` (`lib/whatsNew/pageVisitStore.ts`,
  one `useSyncExternalStore` source for nav + tiles, re-read before each write
  and reloaded on the `storage` event so tabs never undo each other; pure logic
  in `lib/whatsNew/updateDots.ts`). `RootLayout` records each visit
  (`useRecordWowPageVisit`), which clears that page's dot; the first-ever visit
  marks every current entry seen, so new players see no dots. Tiles use the left nav's icons
  (`data/featureIcons.ts`, `WowFeatureIcon`). Tests: `wowWhatsNew.test.ts`,
  `wowForeverLanding.test.tsx`, `e2e/wow-forever-whats-new.spec.ts`.

#### Best gear (`/wow-forever/gear`)

- Top `TOP_ITEMS_PER_SLOT` (3) items per slot card for class + spec + level:
  "While leveling" (what you can wear now + the next upgrade and its level)
  and "Level 60 (pre-raid)". Settings live in the URL (`?class&spec&lvl&faction&view&pvp`;
  `view` pushes history, the rest replace) and `mga.wowForever.gear.settings.v1`;
  first visit seeds class/level/faction from the World Map player. Never
  assert one "correct" spec — the player picks it.
- Scoring reuses `scoring/` (`resolveWeights` + `scoreItem`); proficiencies
  are `data/gear/classProficiencies.ts` (Classic: armor, heavy armor at 40,
  shields, dual wield level). Ranking is `gear/rankGear.ts` (pure, tested in
  `wowGearRanking.test.ts`). **Close rule** (`CLOSE_SCORE_PCT` = 3): a
  known-source item ranks above a no-source one unless the unknown one
  scores more than 3% higher. Level-60 epics with no known source go in a
  separate "may be raid loot" disclosure, not the top 3.
- **Data is GENERATED** — `python -m scripts.wow_gear.build` (from `backend/`,
  last in `wow_refresh`) writes `data/gear/gearFacts.json` (Forever client:
  crafted-by + skill, required skill/reputation, BoP, "Premier" PvP, era
  leftovers, deprecated items) and `data/gear/classic/gearSources.json`
  (cmangos GPL — keep LICENSE + README: quest rewards with level/side/class,
  dungeon boss drops, dungeon level ranges, `raidOnly`, `pvp`). The Forever
  client has **no JournalEncounterItem**, so boss drops are Classic data only.
- Source chips: "Crafted", "Quest", "Boss drop", "Source unknown", each followed by
  its provenance badge (`gearSourceProvenance`: crafted = Game files, quest / drop
  = Classic data, unknown = none). Filters: deprecated/test
  items, random-suffix items, `raidOnly` (raid/world-boss loot, quests gated
  by raid items or the raid reputations `RAID_REPUTATIONS` in
  `wow_gear/raid_gate.py` — Zandalar Tribe, Brood of Nozdormu), PvP unless
  the PvP box is ticked (honor rank, battleground reputation, BG-vendor
  conditions), other-faction / other-class quests.
- Banner: pre-raid phase, raids open `RAIDS_OPEN_LABEL`, Classic Pawn weights,
  Forever stats / hit cap unpublished, ranking approximate; drop rates and
  set bonuses are never shown. `PUBLISHED_LIST` (LFCarry) is linked with its
  checked date — never copied into our data. Item names link to our own item
  page (`/wow-forever/items/:id`); the app never links to Wowhead (operator rule).
- **My lists** (`?view=mine`, the third view; no hub tile): player-made BiS
  lists, browser-only — localStorage `mga.wowForever.gear.bisLists.v1`
  (`hooks/useBisLists.ts`, pure reducer `lib/bisLists/bisListsReducer.ts`,
  stored value re-validated list by list in `parseStoredBisLists.ts`, rows
  tidied by `tidyBisListItems.ts`; nothing is written until something
  changes; another tab's save is loaded via the `storage` event and never
  written back). The Faction toggle ("Quest sources for") is Best gear's own
  `faction` setting — it drives source lines and recommended picks, and
  keeps a share link open. 18 rows (`data/bisLists/bisSlots.ts`:
  two rings, two trinkets; a two-hander clears both hands and vice versa,
  `placeBisItem.ts`); a class's rows follow `groupUsable` (no relics in
  `items.json`, so Paladin/Druid/Shaman have no ranged row). Phases are
  generic (Leveling / Pre-raid / Raid) — never raid names. "Start from
  recommended" = the Best gear top picks (`startingBisItems.ts`; a Raid list
  starts from pre-raid). Per-row "I have it" ticks; no score total, no
  unique-equipped check (no flag in the data). Picking reuses the compare
  search: `components/compare/ItemSearchBox.tsx` (shared with
  `ItemSearchPanel`) with a `slotLimit` / `fits` filter (`fitsBisSlot`).
- **Share links** carry the whole list in the URL fragment, never a server:
  `#list=1~<class>~<spec>~<phase>~<slot>:<id>,…~<name>`
  (`lib/bisLists/bisListFragment.ts`; name percent-encoded incl. `~!'()*`;
  one layer of an app's escaping is undone: separators sent as `%7E`, or a
  `%` before the name field — a link we made never has one there). Links
  point at `window.location.origin`, or `MGA_SITE_URL` inside the Discord
  Activity (`lib/shareOrigin.ts`, shared with the World Map's share link). Decoding is strict: >1200
  chars, wrong version, unknown class or field count → "This list link
  doesn't work"; unknown slots / malformed ids ignored; then
  `checkSharedList.ts` drops ids not in `items.json` or not wearable in that
  row and says how many. A link opens read-only with "Save to my lists".
  Bump the version (and keep decoding v1) for any format change. Tests:
  `wowBisLists.test.ts`, `wowBisListsView.test.tsx`,
  `e2e/wow-forever-gear-lists.spec.ts`.

#### Item pages (`/wow-forever/items/:id`)

- What an item is and how to get it: header (icon, quality-coloured name,
  slot/type, item level, required level), an in-game-style tooltip block, then
  "How to get it", most practical first (`lib/itemPages/itemSourceSections.ts`):
  vendors, quests your faction can do, dungeon drops, crafted, open-world drops,
  containers, other-faction quests, raid drops (raids open `RAIDS_OPEN_LABEL`).
  Every Classic section carries a Classic data badge; recipes are Game files
  (`itemSectionProvenance`). Directions go to
  `/wow-forever/map?to=pt:...&dir=1` (vendors, mobs, quest givers, dungeon doors).
  Item names on Best gear and Item Compare link here (`ItemNameLink`, router
  state `{ from }` so Back returns to that page).
- **Item tooltip** (`ItemNameLink` → `ItemTooltip`, `hooks/useHoverTooltip.ts`):
  mouse hover (150 ms) or keyboard focus (`:focus-visible`) shows
  `ItemStatsBlock` in a `<body>` portal placed by `@floating-ui/react-dom`
  (above, flipped below at the edge); leave / blur / Escape hide it. Touch and
  clicks never open it — a tap only navigates. Data: the page's in-memory
  `ClientItem` when it has one (pass `item` — Best gear, BiS lists, Compare's
  picked item, the item finder), else only the item's Forever shard
  (`lib/itemPages/itemTooltipLoader.ts`, cached per shard). No vendor price in
  the tooltip; the bind line's place is held while the shard loads.
- A Classic item no Forever client has shown yet (`classic/unseen.json`) says
  so — never "doesn't exist" — and an unknown id says "not found"; both offer
  the compare page's name search (`ItemFinder`, `searchItems`).
- **Data is GENERATED** — `python -m scripts.wow_item_pages.build
  --hotfix-cache <DBCache.bin>` (from `backend/`, after the World Map,
  Professions and Items builds). Shard = `id % 64` (`SHARD_COUNT` in
  `shards.py` = `ITEM_PAGE_SHARD_COUNT`; a test pins both). A page lazy-loads
  ONE Forever shard (`data/items/pages/NN.json`: the `items.json` row, bind,
  vendor price, crafted-by from the crafting JSON) and ONE Classic shard
  (`data/items/pages/classic/NN.json`, cmangos GPL — keep LICENSE + README:
  vendors, quests with level/class, open-world drops, dungeon/raid drops,
  containers) through `import.meta.glob` (`data/itemPages/itemPageShards.ts`);
  never import a shard statically. Drop chances follow cmangos loot rules
  (`loot_chances.py`: equal-share groups, references rolled `maxcount` times, a
  reference ≥10 creatures share is a "world drop" with a level range).
  `tests/test_wow_item_pages_generator.py`, `src/__tests__/wowItemPage*.test.ts(x)`,
  `e2e/wow-forever-item-page.spec.ts`.

#### Item browser (`/wow-forever/items`)

- `pages/WowItemsPage.tsx` + `components/itemBrowser/`: every item in
  `items.json` — "the items the Forever game files have shown so far", never
  "all items"; a missing item is "not seen yet", never "removed". Name search
  (every word, any order; one-letter-off only when no name matches at all — a name the chips hide
  still counts, so a chip never swaps in near misses; reusing
  `lib/itemSearch.ts`), chips with counts for quality, item class (Armor /
  Weapons / Shields & off-hands / Jewelry & trinkets / Cloaks / Other — by
  slot, so a cloak is never Cloth; a Shield-type off hand is a shield), slot,
  armor / weapon type and "Changed" / "New in Forever", plus required / item
  level ranges. Sort: item level (default) or required level high→low, name
  A→Z; a new sort starts in its own direction. List / Grid. `ITEM_BROWSER_PAGE_SIZE`
  (60) rows per "Show more" — no virtualisation library; the open page count is
  `?pages` so Back from an item keeps the spot, and a new search / filter / sort resets it.
  Level boxes clamp to their ends (never silently drop an out-of-range number). On a phone the filters
  fold behind one "Filters (n)" button.
- Everything is the URL (`?q&quality&class&slot&type&change&rmin&rmax&imin&imax&sort&dir&view&pages`,
  replace history, defaults left out; `hooks/useItemBrowserQuery.ts` on
  `useLiveSearchParams` (`@platform/ui`), pure `lib/itemBrowser/itemBrowserParams.ts`).
  Filtering / chip counts are `lib/itemBrowser/filterItems.ts` (a chip counts
  with every other group applied but not its own), sorting `sortItems.ts`
  (ties by name, then id). Rows link through `ItemNameLink` (tooltip; the item
  page's Back reads "Back to Items" and returns to the same search). An item
  page counts as the Items tile for update dots.
- "Changed in Forever" compares only what the Changes feed compares (name,
  quality, ilvl, required level, armor, weapon damage / speed, main stats —
  not equip effects), so no mark ≠ unchanged; "New" = not in the Classic Era
  game files. Tagged Game files (`ItemBrowserNote`). No drop sources, BiS or
  scores here — that's the item page and Best gear.
- **Index is GENERATED** — `python -m scripts.wow_item_pages.index` (from
  `backend/`, in `wow_refresh` right after the Changes build, which it reads)
  writes `data/items/itemIndex.json` from `items.json` +
  `data/changes/items.json` / `itemsNew.json`: one row per item
  (`[id, name, quality, slot, type, ilvl, req, change]`, enums as positions in
  the header lists; ~106 KB gzipped). It's its own lazy chunk
  (`lib/itemBrowser/loadItemIndex.ts`), decoded by `decodeItemIndex.ts`; never
  import the item-page shards for the list. Tests:
  `tests/test_wow_item_index_generator.py`, `src/__tests__/wowItemBrowser.test.ts`,
  `e2e/wow-forever-item-browser.spec.ts`.

#### Dungeon pages (`/wow-forever/dungeons`, `/wow-forever/dungeons/:slug`)

- Index (lowest level first) and one page per dungeon, in this order:
  - **When you can go** (`DungeonWhen`, one `DungeonFactRow` + badge per
    fact): recommended level (Forever LFGDungeons → ContentTuning, Game
    files), lowest level to go in (cmangos `areatrigger_teleport.required_level`,
    **Classic data** — never Game files), group size (Forever `Map.MaxPlayers`,
    Game files; hidden when unknown), key or attunement to go in (Classic
    `areatrigger_teleport` item/quest — no Classic 5-player dungeon has one)
    and, when there are any, the keys the interior's locked doors take
    (`classicInteriors.json` doors, Classic data). Never write "no locked
    doors": the door data isn't complete (UBRS's Seal of Ascension is missing).
  - **Where it is** (`DungeonLocation`): per zone, zone · sub-zone, "Show
    entrance on the World Map" (`/wow-forever/map?m=<zone>`), the nearest
    flight master per faction (own or neutral, same continent, straight-line
    yards from the zone's first door — `lib/dungeons/nearestFlightPaths.ts`,
    `travel.json`, Game files), then each door (`DungeonDoorRow`: its wing or
    "Entrance", coords, "Directions to …" = `directionsHref` →
    `/wow-forever/map?to=pt:...&dir=1`, and the World Map's
    `InstanceInterior` — the bosses behind that door, i.e. the wing breakdown).
  - The bosses in order (Forever `DungeonEncounter`, Game files) as jump
    links, then each boss's section (`#boss-<slug>`, a shareable deep link;
    `hooks/useScrollToHash.ts` scrolls to it once the data has loaded) with its
    drops: icon, `ItemNameLink` (hover tooltip → item page), slot/type and
    drop chance (Classic data). Raids are left out; Forever-only dungeons have
    no rows yet.
  - **Quests** (`components/dungeons/quests/DungeonQuests`, after "Where it
    is"; `Dungeon.quests`, decoded by `lib/dungeons/decodeDungeonQuests.ts`):
    the quests for your faction (the World Map's saved faction, a "Quests for"
    toggle; "N" quests show for both), lowest level first, each a collapsible
    row: who gives it (out in the world → `questGiverMapHref`, the World Map's
    own `#view=` share link zoomed on the giver with one read-only quest mark,
    plus coordinates and `directionsHref`; or "Inside the dungeon" / an item
    that starts it), the quests before it as an ordered list ending with this
    one, objectives (an "Inside the dungeon" chip on targets found only
    there), rewards (`ItemNameLink`, choose-one and also-get) and who takes it
    back. Badges: the section's "in the Forever game files" note (Game files —
    every quest is in Forever's `QuestV2`); title, levels, objectives and
    rewards are "Seen in game" + date when the operator's client cache has the
    quest, else Classic data; giver, chain and hand-in are always Classic data.
    A dungeon's quests = filed under one of its areas (`ZoneOrSort` →
    `dungeon_areas`: AreaTable names "X" / "The X" + `Map.AreaTableID`) or
    with an objective only found inside (creature / object spawns all on the
    instance map, or an item every direct dropper of is inside —
    `quest_places.py`). Repeats (same title, givers by name, objectives,
    rewards) and quests another listed quest leads on from are dropped.
    Rewards are only items in `items.json`.
- Built in the browser from files the World Map already ships
  (`classicDungeons.json`, `classicInteriors.json`, `zones.json`,
  `travel.json` — decoded with the World Map's own `decodeZone` /
  `decodeTravel` into a `DungeonWorld`) plus `data/dungeons/lootItems.json`
  (Forever item names/slots), `data/dungeons/dungeonFacts.json` (Forever group
  sizes), `data/dungeons/classic/bossLoot.json` and
  `data/dungeons/classic/entryRequirements.json` (cmangos GPL — keep LICENSE +
  README), all lazy-loaded once by `lib/dungeons/loadDungeons.ts` and decoded
  by the pure `decodeDungeons.ts`. Slugs: `dungeonSlug` / `uniqueSlugs` (a
  repeated boss name gets `-2`) — don't change them, they're links.
- **Loot, group sizes and entry requirements are GENERATED** —
  `python -m scripts.wow_dungeons.build` (from `backend/`, after the World Map
  and Items builds; group sizes from wago.tools `Map`, entry requirements in
  `wow_dungeons/entry.py`). The Forever client has no
  JournalEncounter* tables, so a boss's loot is its cmangos loot table (rolled
  by `wow_item_pages/loot_chances.py`, world pools excluded, chance ≥ 0.5%)
  keeping only items in `items.json` — never filled from Classic Era items.
  Encounter → creature names that differ are in `ENCOUNTER_CREATURES`
  (`boss_loot.py`). A boss with no loot table reads "No loot list for this
  boss yet"; one whose Classic loot isn't in Forever yet says so.
  `tests/test_wow_dungeons_generator.py`, `src/__tests__/wowDungeons.test.ts`,
  `e2e/wow-forever-dungeons.spec.ts`.
- Every dungeon on the index has a boss list — `test_wow_interiors_generator.py`
  and `wowDungeons.test.ts` fail otherwise (the vitest's
  `NO_BOSS_LIST_EXCEPTIONS` is the only place to excuse one, with a reason).
- **Quests are GENERATED** by the same build (`wow_dungeons/quests.py`,
  `quest_places.py`) into `data/dungeons/classic/dungeonQuests.json` (cmangos
  `quest_template`, quest relations, spawns, loot — GPL) and
  `data/dungeons/dungeonQuestsSeen.json` (the operator's Forever
  `Cache/WDB/enUS/questcache.wdb`, read by `quest_cache.py`; the build takes
  `--quest-cache` / `WOW_FOREVER_QUEST_CACHE` and stops when it's missing;
  never commit the raw cache). Records the reader can't parse (Forever's
  profession writs) are skipped; the build stops if one is a dungeon quest.
  Reward items are in `wanted_ids()` for icons. Tests:
  `tests/test_wow_dungeon_quests_generator.py`,
  `src/__tests__/wowDungeonQuests.test.tsx`,
  `e2e/wow-forever-dungeon-quests.spec.ts`.

#### Rares (`/wow-forever/rares`)

- `pages/WowRaresPage.tsx`: every Classic rare and rare elite with an
  open-world spawn plus the rares new in Forever, lowest level first (new in
  Forever last). Each card (`components/rares/RareRow`): name,
  classification chip ("Seen in game" + date when the Forever client has met
  it — `Rare.seenOn` — else Classic data), level (Classic data), where it spawns +
  "Show on map", a `/target <Name>` line with Copy, its own drops
  (`BossLootRow` → `ItemNameLink`) and a "Seen / killed" tick
  (`mga.wowForever.rares.checklist.v1`, `useChecklist`, "Clear seen / killed").
- Filters live in the URL (`?zone&min&max&fit=1&confirmed=1`, replace history,
  `hooks/useRareFilters.ts`, pure `lib/rares/rareFilterParams.ts` +
  `filterRares.ts`). "Fits my level" = 3 below to 2 above the World Map's
  saved level (`mga.wowForever.worldMap.player.v1`, edited here too); level
  filters drop rares with no level. "Confirmed in Forever" (chip) keeps only
  rares the client has met. "Copy macro" packs the filtered names into
  `/target` macros of at most 255 characters each (`lib/rares/targetMacros.ts`,
  a line break counts as one; shows "N / 255 characters" per macro).
- "Show on map" = the World Map's own `#view=` share link
  (`lib/rares/rareMapHref.ts`): the zone with most of its spots, fitted to
  them, a read-only ★ mark per spot, the Rares layer previewed on.
- **World Map "Rares" layer** (`MAP_LAYER.rares`, share code `ra`, off by
  default): every spawn of every rare for both factions, marker id
  `rare:<id>:<i>`. Rares load lazily (`lib/rares/loadRares.ts`, `useRares`)
  like the gathering spots; `layerCounts` takes the loaded lazy sources
  (`LazyLayerSource`) and shows "loading" / "didn't load" until then. Picking
  a rare pin shows `RareMapCard` under the map (drops with item tooltips).
- **Data is GENERATED** — `python -m scripts.wow_rares.build --creature-cache
  <creaturecache.wdb>` (from `backend/`, in `wow_refresh` after the changes
  build; `--creature-cache` / `WOW_FOREVER_CREATURE_CACHE`, stops when missing;
  never commit the raw cache). The list = every cmangos `creature_template`
  with `Rank` 2 (rare elite) / 4 (rare) and an open-world spawn, plus every
  creature the operator's Forever `Cache/WDB/enUS/creaturecache.wdb` calls a
  rare (`wow_rares/creature_cache.py`; same codes). A creature the client has
  met is "confirmed" (`data/rares/rares.json`: Forever's name and
  classification); a Classic rare the client shows as something else is left
  out. Classic name, rank, levels, spawns (continents only, event-only spawns
  dropped, spots within a few yards merged) and drops come from cmangos
  (`data/rares/classic/rareSpawns.json`, GPL — keep LICENSE + README). Drops
  are the creature's own loot (`boss_loot.creature_drops`) at ≥ 2%
  (`NOTABLE_DROP_CHANCE`; shared-table greens drop out) and only items in
  `items.json`; their ids are in `wanted_ids()` for icons.
  Tests: `tests/test_wow_rares_generator.py`, `src/__tests__/wowRares.test.ts`,
  `e2e/wow-forever-rares.spec.ts`.

#### Library books (`/wow-forever/library`)

- `pages/WowLibraryPage.tsx` + `components|lib|hooks|data|types/library/`:
  "Turning books in" (who takes the books and how many a reward needs — both
  "Not known yet", `LIBRARY_UNKNOWN`), each reward quest (link to
  `/wow-forever/quests/:id`, Seen in game + date, choose-one rewards via
  `ItemNameLink`), the library cards (Game files) and every book: icon, name,
  item level (Game files badge), the in-game description, "Where: Not known
  yet" and a "Found" tick (`mga.wowForever.library.checklist.v1`,
  `useChecklist`, "Clear found"). Filters live in the URL (`?q&ilvl&hide=1`,
  replace history, `hooks/useLibraryFilters.ts`, pure
  `lib/library/libraryFilterParams.ts` + `filterBooks.ts`; an item-level chip
  counts with the other filters on). No map link until a book's location is
  known — never guess one, and never fill locations, the turn-in NPC or the
  book count from a fan site.
- **Data is GENERATED** — `python -m scripts.wow_library.build --hotfix-cache
  <DBCache.bin> --quest-cache <questcache.wdb>` (from `backend/`, in
  `wow_refresh` before the icons build; reads `items.json`) writes
  `data/library/library.json`: books = every Forever `ItemSparse` row whose
  description ends "… addition to any library's collection." (40 today),
  cards = "<city> Library Card" rows, reward quests = quest-cache titles
  naming the Library (Friend of the Library, 78150) with their rewards. A
  reward missing from `items.json` stops the run. Book, card and reward ids
  are in `wanted_ids()` for icons. Tests:
  `tests/test_wow_library_generator.py`, `src/__tests__/wowLibrary.test.ts`,
  `e2e/wow-forever-library.spec.ts`.

#### Legacy planner (`/wow-forever/legacy`)

- `pages/WowLegacyPage.tsx` + `components|lib|hooks|data|types/legacy/`: a
  summary strip (this character's points spent / left of the cap, the points
  the ticked challenges add up to for the whole account, the account rank),
  the planner, the challenges checklist and the account rank's reward track.
  Points are earned once per challenge and shared by every non-Hardcore
  character; each character spends up to the cap (16) over the three trees
  (Professions, Adventure, Resourcefulness). Everything the game files don't
  say reads "Not known yet" (`LEGACY_UNKNOWN`: how a talent grows per rank,
  whether linked talents need the earlier one, how the account rank goes up).
- Trees are drawn from the nodes' own grid positions (`col` / `row`, tiers
  left to right) with their edges (`LegacyEdges`; dashed into a "coming in a
  future update" placeholder). Side by side from `lg`, tabs below it. Click /
  tap adds a rank; right-click, a long press (`useLongPress`) or the details
  panel's − removes one. Rules are pure (`lib/legacy/legacyRules.ts`): a node
  takes up to its max ranks (placeholders none), the total is capped, and a
  gated node (5 / 10) opens once that many points are in its tree in nodes
  with a lower gate. Edges are drawn but NOT enforced (the files don't say
  what they require).
- **The plan is the URL**: `?b=1-<tree1>-<tree2>-<tree3>` (one digit per node
  in file order, trailing zeros dropped, `lib/legacy/legacyPlanCode.ts`;
  replace history). Decoding is strict (length, version, tree count, digits,
  then `isLegalPlan`) → an empty plan and "That plan link doesn't work". Bump
  the version for any format change; never reorder a tree's nodes. Copy link
  + Reset reuse `TalentShareBar`.
- Challenge ticks: `mga.wowForever.legacy.checklist.v1` (`useChecklist`,
  "Clear ticks"), per browser — the page says points are per account.
  Rewards are plain names (their items aren't in `items.json`).
- **Data is GENERATED** — `python -m scripts.wow_legacy.build --hotfix-cache
  <DBCache.bin>` (from
  `backend/`, in `wow_refresh` before the icons build) writes
  `data/legacy/legacy.json` from the Forever client (`load_forever_tables`,
  wago `wowf` + hotfixes): TraitSystem 45's trees (TraitTree / TraitNode /
  TraitNodeEntry / TraitDefinition, gates from TraitCond, edges from
  TraitEdge), the "Legacy" currency cap, challenges from the currency's
  source rows (merged by text + title, by category), and the "Renown - Legacy
  Rank" reward track. Currency, node, challenge and reward icons are in
  `wanted_ids()`. Tests: `tests/test_wow_legacy_generator.py`,
  `src/__tests__/wowLegacy.test.ts`, `e2e/wow-forever-legacy.spec.ts`.

#### Races (`/wow-forever/races`, `/wow-forever/races/:race`)

- `pages/WowRacesPage.tsx`: every playable race (Alliance then Horde, races new
  in Forever last in each) as a card (`components/races/RaceCard`): faction,
  starting zone + its badge (Classic data; Unconfirmed for the Skyborne, whose
  Zephras Isle start is the World Map's own note — `UNCONFIRMED_START_ZONES`)
  + "Show on the World Map", class chips ("New in Forever" on a combination
  Classic didn't allow), the racial names as jump links, then each racial
  (`RacialRow`: icon, Active / Passive, status). Statuses: New / Changed /
  Same as Classic / Removed in Forever. A changed racial shows Classic Era |
  Forever side by side (`RacialCompare`) and "Was: <name>" when renamed;
  removed ones are collapsed at the bottom with their Classic text
  (`RemovedRacials`, opened by a link to one of them). Class versions read
  "Warrior, Rogue: …". `/races/:race` shows one card (an unknown slug says so).
  Never write a "best race" verdict.
- Anchors: `#<race slug>` and `#<race slug>-<racial slug>` (`Racial.key`) —
  links; never change one. `useScrollToHash` scrolls once loaded.
- Filters live in the URL (`?faction&class&status&changed=1`, replace history,
  `hooks/useRaceFilters.ts`, pure `lib/races/raceFilterParams.ts` +
  `filterRaces.ts`); every chip shows what the list would hold with it picked
  (`raceFilterCounts`). A racial filter drops races left with no racial;
  "Only changed" hides "Same as Classic" and keeps removed racials.
- **Data is GENERATED** — `python -m scripts.wow_races.build --hotfix-cache
  <DBCache.bin>` (from `backend/`, in `wow_refresh` after the Rares build,
  before icons) writes `data/races/races.json` from the Forever client
  (ChrRaces, CharBaseInfo, SkillLine / SkillLineAbility / SkillRaceClassInfo
  racial lines, Spell* with hotfixes; tooltip text from
  `scripts/wow_food/tooltip.py`) compared with the Classic Era client, and
  `data/races/classic/racials.json` (the Classic Era client's text of
  changed / removed racials, and Classic starting zones from cmangos
  `playercreateinfo` — GPL, keep LICENSE + README). Racials are paired by spell id, then name. A token
  the game files can't fill (War Stomp's target count, Berserking's linked
  spell, Find Treasure's until-cancelled duration) is printed as "?" and the
  racial is `partial`; statuses compare the texts with "?" in place. Never
  fill one from another source. Racial icons go into `wowIcons.json` `files`.
  Tests: `tests/test_wow_races_generator.py`, `tests/test_wow_spell_tooltip.py`,
  `src/__tests__/wowRaces.test.ts`, `e2e/wow-forever-races.spec.ts`.

#### Talent calculator (`/wow-forever/talents`, `/wow-forever/talents/:class`)

- `pages/WowTalentsPage.tsx`: the class picker (links, so Back returns to the
  last class), then the class's three trees in the game's 7 × 4 grid
  (`components/talents/`): side by side from `lg`, one at a time behind tabs
  below it. Click / tap adds a point; right-click, a long press
  (`hooks/useLongPress.ts`, touch / pen only) or the details panel's − takes
  one out. Each grid is one Tab stop (roving tabindex): arrows move, Enter
  adds, Shift+Enter removes. Hover / keyboard focus shows `TalentTooltip`
  (`useHoverTooltip`); the picked talent's `TalentDetails` shows the rank you
  have and the next one, what blocks a change, and − / + (44 px).
- Rules are Classic and pure (`lib/talents/talentRules.ts`): level 10–60,
  points = level − 9; a row opens at 5 points per row above it in that tree;
  a prerequisite needs its max rank (same-row and diagonal ones exist); a point
  can't come out while a dependent or a lower row needs it. Grid / arrow
  geometry is `data/talents/talentGridLayout.ts` + `lib/talents/talentArrows.ts`.
- **The build is the URL** (`hooks/useTalentBuild.ts`, `useLiveSearchParams` (`@platform/ui`),
  every change replaces history): `?b=2-<tree1>-<tree2>-<tree3>` — one digit
  per talent in the file's order (tier, then column), trailing zeros dropped
  (`lib/talents/talentBuildCode.ts`) — and `?lvl=` (omitted at 60). Decoding is
  strict: wrong version / tree count / characters / length or a build no
  character could have (`isLegalBuild`) → an empty build and "That build link
  doesn't work". Version 2 = the live trees; a `1-` link (the old Classic
  trees, a different talent order) deliberately reads as no build. Bump the
  version for any format or order change; never reorder a class's talents within
  a version. "Copy link" = `shareOrigin()` + path + query.
- **Data is GENERATED** — `python -m scripts.wow_talents.build --hotfix-cache
  <DBCache.bin>` (from `backend/`, in `wow_refresh` before the icons build). The
  trees are the LIVE game's, from Blizzard's Game Data API (`static-forever-us`,
  `scripts/wow_talents/blizzard_api.py`; needs `BLIZZARD_CLIENT_ID` /
  `BLIZZARD_CLIENT_SECRET` in `backend/.env` — missing ones stop the run, and
  `wow_refresh apply` checks them before repinning). The client's Talent /
  TalentTab rows are the old Classic trees and are NOT used. Each spec's nodes
  (`display_row` 1–7, `display_col` in three bands, `TREE_COLUMN_BASES`) become
  the trees; ids are Blizzard's talent ids; each rank's text is Blizzard's own
  description (`Official` badge, `PROVENANCE_DETAIL.liveTalents`). A node outside
  the 7 × 4 grid or a requirement on a lower row is printed and left out.
  `data/talents/<class>.json` = `{source, apiBuild, classId, trees}`. Icons:
  the client's SpellMisc for the rank-1 spell, else Blizzard's spell media.
  `data/talents/classic/<class>.json` (Classic Era wording + cmangos
  `spell_template` numbers, GPL — keep LICENSE + README) holds the Classic text
  of ranks whose Forever text differs ("Changed in Forever. Classic: …"). A
  talent matches Classic by rank-1 spell id, else by name; one with no match is
  `newInForever` ("New in Forever" badge and dot in compare mode). Each class is
  its own lazy chunk (`data/talents/talentFiles.ts`,
  `lib/talents/loadTalentClass.ts`). Talent and tree icon file ids go into
  `wowIcons.json` `files` (publish them with `wow_icons.publish`).
  Tests: `tests/test_wow_talents_generator.py`,
  `tests/test_wow_spell_tooltip.py`, `src/__tests__/wowTalentRules.test.ts`,
  `src/__tests__/wowTalentBuildCode.test.ts`, `e2e/wow-forever-talents.spec.ts`.
- `?talent=<id>` (`TALENT_PICK_PARAM`, `lib/talents/findTalentPosition.ts`)
  opens the calculator on that talent's tree with its details showing — the
  Changes feed links with it. Read once on load; an unknown id is ignored.

#### Changes vs Classic (`/wow-forever/changes`)

- `pages/WowChangesPage.tsx`: one category at a time (Talents / Class spells /
  Items / Quests / Zones & maps, `data/changes/changeCategories.ts`), a class
  filter (talents, spells, items only), a search (every word, any order,
  `worldMap/searchText`) — all in the URL (`?cat&class&q&since`, replace
  history, `hooks/useChangeFilters.ts` on `useLiveSearchParams` (`@platform/ui`)), 50 rows at a
  time. Each card: icon, name linked to our own page (item page with tooltip,
  talent calculator `?talent=`, World Map `?m=`; none for spells, map rows or
  zones not on the World Map), kind chip, the generated sentence, Classic |
  Forever rows (a table from `sm`, stacked on a phone), and badges: Game files
  (Official for talents, which come from the live API trees; Seen in game + date
  for quests named from the operator's cache) plus
  Classic data on changed rows. "Only what changed since build X" shows only
  once `index.json` has a `previousBuild` (after a second refresh); until then
  a note says so.
- **Data is GENERATED** — `python -m scripts.wow_changes.build --hotfix-cache
  <DBCache.bin> --quest-cache <questcache.wdb>` (from `backend/`, in
  `wow_refresh` after the Items and Talents builds). Every row is a diff of the
  Forever client (`wowf` + hotfixes) against Classic Era (`wow_classic_era`):
  talents from the calculator's own output (a talent spell is never also a
  class-spell row); items from `items.json` (name,
  quality, ilvl, required level, armor, weapon damage / speed, primary stats —
  equip-spell stats aren't compared) plus new gear, consumables and recipes;
  class trainer spells (`SkillLineAbility` × `CLASS_LINES`, tooltip text with
  tokens filled; a rank with an unfilled token is a gap, never compared);
  QuestV2 ids not in Classic, named only from the quest cache; UiMap / Map rows
  not in Classic. Sentences are generated (`wow_changes/describe.py`) — never
  hand-write one. `index.json` (counts, builds, gaps, shard list) is in the
  page's chunk; each shard (`items.json`, `itemsNew.json`, `quests.json`,
  `zones.json`, `classic/talents.json`, `classic/spells.json` — cmangos GPL,
  keep LICENSE + README) is its own lazy chunk (`data/changes/changeFiles.ts`).
  Each row's `since` = the build its content first appeared in (`stamp.py`,
  read from the previous files before they're overwritten). Tests:
  `tests/test_wow_changes_generator.py`, `src/__tests__/wowChanges.test.ts`,
  `e2e/wow-forever-changes.spec.ts`.

#### Spellbook (`/wow-forever/spellbook`, `/wow-forever/spellbook/:class`)

- `pages/WowSpellbookPage.tsx`: the class picker (`components/shared/ClassLinkPicker`,
  shared with the talent calculator), then every spell the class can train in Forever,
  grouped by spell tab, lowest learn level first (`components/spellbook/`). Each card:
  icon, name, tags (Different from Classic / New in Forever, Talent, Passive, race-only),
  first learn level, its ranks behind "Show all N ranks" (each: level, how it's learned —
  "Trainer: <cost>", "From a quest", "From a book" with a Classic data badge, or "Talent
  point" — and its tooltip), then links: the Changes feed (`?cat=spells&class&q`), the
  talent calculator (`?talent=`) and the downrank calculator (`?spell=`). Each card is
  `#spell-<id>` (ids are links — never change one); a deep link scrolls to it with its
  ranks open.
- Filters live in the URL (`?tab&diff=1&q&lvl`, replace history,
  `hooks/useSpellbookFilters.ts`, pure `lib/spellbook/spellbookFilterParams.ts` +
  `filterSpells.ts`): a tab chip counts that tab with the other filters on, the
  "Only different from Classic" chip counts with the tab on. "Your level" keeps spells
  with a rank learnable by then; talent spells (no learn level) drop out and the page says so.
- Talent ranks never carry a level: a talent's spell level isn't when you can take it.
  A blank tooltip reads "This rank's tooltip has numbers we can't read from the game files
  yet." — never worked out from its neighbours.
- Tooltip text is evaluated by `scripts/wow_food/tooltip.py` (shared with talents, changes,
  food, professions): effect values and rolls, description variables (`$<name>`, from
  SpellXDescriptionVariables), `${}` expressions (whole numbers unless `.N`), radius, range,
  target caps (SpellTargetRestrictions), `$e`/`$f`/`$b` (Classic: EffectMultipleValue /
  DmgMultiplier / EffectPointsPerComboPoint) and `$g`. Formulas on the player's own stats
  (`$SPI`, `$SPFR`, `$apm`, `$rap`, `$bh`, …) have no static number and stay unresolved — the
  rank then falls back to Classic's text, else blank. Never fill one in.
- **Data is GENERATED** — `python -m scripts.wow_spellbook.build --hotfix-cache
  <DBCache.bin>` (from `backend/`, in `wow_refresh` after the downrank build) writes
  `data/spellbook/<class>.json` (Forever: tabs, spells, ranks, levels, icons, text, talent
  ids, changed marks, downrank families) and `data/spellbook/classic/<class>.json`
  (cmangos GPL — keep LICENSE + README: `costs`, `quests`, `books`, plus `texts` /
  `levels` for ranks the client lacks, each shown with a Classic data badge). A spell is
  in the book when Classic taught it (trainer, quest reward or book) or Forever added it
  with a level or a talent; SoD copies, hidden and placeholder spells are left out. Each
  class is its own lazy chunk (`data/spellbook/spellbookFiles.ts`,
  `lib/spellbook/loadSpellbookClass.ts`). Spell icons go into `wowIcons.json` `files`
  (publish them with `wow_icons.publish`). Tests: `tests/test_wow_spellbook_generator.py`,
  `src/__tests__/wowSpellbook.test.ts`, `e2e/wow-forever-spellbook.spec.ts`.

#### Trainers (`/wow-forever/trainers`, `/wow-forever/trainers/:subject`)

- `pages/WowTrainersPage.tsx`: one grouped picker (Classes, then the Professions page's
  groups; `data/trainers/trainerSubjects.ts`), faction + "Your level" (`usePlayerSettings`),
  then the class or profession view (`components/trainers/`). A slug is a class id or a
  `GuideProfession` (`firstaid`).
- Class: "What you can learn at each level", built from the spellbook data
  (`lib/trainers/levelUnlocks.ts`, talent ranks left out) with the levels below yours folded
  away and the next one marked; then "Where to train": the class trainers and, for hunters
  and warlocks, pet / demon trainers (`CLASS_EXTRA_TRAINERS`). No costs: Classic costs are
  wrong for Forever. Links to the spellbook for spell details. Warlock adds "What your demons
  learn at each level" between the two (`demonUnlocks`, same ladder; each unlock tagged with its
  demon and "Grimoire" or "Knows it when summoned"), from `demons` in `data/spellbook/warlock.json`
  (`scripts/wow_spellbook/demons.py`: the `PET_LINES` skill lines, `SpellLevels` = the level the
  Grimoire asks, `AcquireMethod` 2 = known on summon, Grimoire items matched by name from
  Forever's `ItemSparse`; demon icons go into `wowIcons.json` via `spellbook_icon_files`).
- Profession: each rank's skill, level and cap (`lib/trainers/professionRankSteps.ts`:
  crafting from `CRAFTING_RANKS`, gathering from `GATHERING_RANKS`, Cooking / Fishing from
  their route milestones), then every trainer for your faction, and a link to its guide.
- Trainer NPCs are the World Map's `classicServices.json` (cmangos Classic,
  `lib/trainers/serviceTrainers.ts`, capitals first). Forever added trainers Classic doesn't
  have (Horde Paladin, Alliance Shaman, …): an empty list says so, never invents one.
  Tests: `src/__tests__/wowTrainers.test.ts`, `wowTrainersPage.test.tsx`,
  `e2e/wow-forever-trainers.spec.ts`.
- Icons: every picker chip shows its class / profession icon (`lib/trainers/trainerSubjectIcon.ts`)
  and every unlock its spell's icon (`LevelUnlock.icon`, from the spellbook data).

#### Downrank calculator (`/wow-forever/downrank`)

- `pages/WowDownrankPage.tsx`: class + spell (22 heal / nuke families), your
  level, +healing or +spell damage and optional talent % (more amount, less
  mana — cast-time talents aren't counted, the page says so); then "Suggested
  ranks" (most per mana, most per second, each a `/cast Spell(Rank N)` line
  with `MacroCopyButton`), "How it's worked out" (Game files / Classic data /
  Unconfirmed badges + the below-20 switch), and every rank: a table from
  `md`, cards below it (`components/downrank/`). Ranks above your level are
  greyed and never "best"; a tie goes to the lower rank.
- Math is pure (`lib/downrank/downrankMath.ts`, `wowDownrank.test.ts`):
  amount = base + per-level gain (stops at max level) + bonus × coefficient ×
  penalties, × (1 + talent %); coefficients are the Forever client's own
  (`EffectBonusCoefficient`, per tick for periodic parts). Penalties are
  Classic's: below level 20 = 1 − (20 − learned) × 3.75% — Forever's files
  DON'T include it, so it's on by default, tagged Unconfirmed, and `p20=0`
  turns it off — and downranking = (max level + 5) / your level past
  `fullBonusUntil`. Per second = amount / max(cast, 1.5 s), or / duration for
  a tick-only spell. Chain Heal = first target; Prayer of Healing = per target.
- Settings are the URL (`?spell&lvl&bonus&tal&mana&p20`, replace history,
  `hooks/useDownrankSettings.ts` on `useLiveSearchParams` (`@platform/ui`)); spell and level are
  always written so a shared link means the same thing. With no URL the World
  Map's saved class / level fill in (a class with no family → Priest); never
  written back.
- **Data is GENERATED** — `python -m scripts.wow_downrank.build --hotfix-cache
  <DBCache.bin>` (from `backend/`, in `wow_refresh` after the Changes build)
  writes `data/downrank/spells.json` (Forever: Spell, SpellName, SpellEffect,
  SpellMisc, SpellDuration, SpellCastTimes, SpellLevels, SpellPower,
  SkillLineAbility; SoD rune copies — AcquireMethod 3 — skipped) and
  `data/downrank/classic/ranks.json` (ranks Forever lacks: cmangos numbers,
  GPL — keep LICENSE + README; empty today). Both are one lazy chunk
  (`data/downrank/downrankFiles.ts`, `lib/downrank/loadDownrank.ts`). Family
  icons go into `wowIcons.json` `files`. Tests:
  `tests/test_wow_downrank_generator.py`, `src/__tests__/wowDownrank.test.ts`,
  `e2e/wow-forever-downrank.spec.ts`.

#### Server status (`/wow-forever/server-status`)

- `pages/WowServerStatusPage.tsx`: the live section (`WowServerStatusSection`,
  also on the hub with a link here), **Uptime history** and **Can't log in?**.
- **Recording** (`app/services/wow/server_status/`, table
  `wow_server_status_sample`, migration 0050): scheduler job
  `record_wow_server_status` every 5 min + once at boot, its own switch
  `WOW_SERVER_STATUS_RECORDING_ENABLED` (default true) — runs in serve-only
  prod like the prices job. A row is written only on a ruleset's first
  sighting, a status change, or as an hourly checkpoint
  (`CHECKPOINT_INTERVAL`); a failed Blizzard call stores nothing and logs a
  WARNING with Blizzard's error (a gap, never "down"). A per-region advisory
  lock makes an overlapping run skip. Retention 90 days
  (`purge_wow_server_status_history`, daily, always on). By hand:
  `python -m app.cli record-wow-server-status`. Constants:
  `app/core/wow_server_status.py`.
- `GET /api/wow/server-status/history?region=` (public, both modes,
  `max-age=60`): 7 days of points per ruleset (+ the row before the window),
  the current streak's start (`since`, `since_exact` false = older than the
  rows kept) and `max_gap_seconds` (1 h + 2 checks): a point older than that
  with nothing after it is drawn as **no data**.
- Frontend math is pure and tested (`lib/serverStatus/`: `rulesetTimeline`,
  `uptimePercent` — recorded time only, `listOutages`, `streakLine`,
  `formatDuration`); 24h / 7d in `?range=` (replace history). Times are in
  the reader's time zone (`formatLocalDateTime`).
- Login errors are hand-written in `data/serverStatus/loginErrors.ts` — our
  own words, never copied from Blizzard / Wowhead / other sites. Search is
  `searchLoginErrors` (words in any order, or the code's digits); each card
  is `#err-<id>` (ids are links — never change one). Tagged Unconfirmed
  (`PROVENANCE_DETAIL.loginHelp`: our own advice from common player reports,
  not from Blizzard); "Official" only with a linked Blizzard article for
  that error. Tests: `tests/test_wow_server_status_history.py`,
  `src/__tests__/wowServerStatusHistory.test.ts`,
  `src/__tests__/wowServerStatusPage.test.tsx`,
  `e2e/wow-server-status-history.spec.ts`.

#### Your character (`/wow-forever/character[/:slug]`)

- No Battle.net login: the player types first name + surname; Blizzard's
  Profile API serves Forever characters at `/profile/wow/character/{first-surname}`
  (namespace `profile-forever-us`, US only) with the app's client token.
- Backend: `app/api/wow_characters.py` — `GET /api/wow/characters/{slug}`
  (profile + equipment + statistics + specializations + professions + reputations + pvp-summary + achievements/statistics + collections/mounts + collections/pets, mapped by `services/wow/character/character_mapper.py`;
  `stats` by `character_stats_mapper.py`, `talents` by `character_talents_mapper.py`,
  `professions` by `character_professions_mapper.py`, `reputations` by `character_reputations_mapper.py`,
  `pvp` by `character_pvp_mapper.py`, `collections` by `character_collections_mapper.py`,
  `dungeons` by `character_dungeons_mapper.py`)
  and `/{slug}/render.png` (Blizzard's `main-raw` render, fetched only from
  `render.worldofwarcraft.com`, refused over 3200x2400 px before decoding,
  cropped to the figure with Pillow). Per-IP limit 30/min on each route
  (separate budgets), in-process 5-min caches (500 profiles, 100 renders),
  `max-age=300`; errors
  400 bad slug, 404 `character_not_found` / `character_render_not_found`,
  429, 502 `character_upstream_failed`. Constants `app/core/wow_character.py`.
  Shared Blizzard HTTP (`services/wow/blizzard/`: token cache, send, error
  class) is also what the auction client uses.
- Stored characters (migration 0054, `services/wow/character/character_store_service.py`,
  for the guild pages): the route goes through `character_lookup_service`,
  which still serves Blizzard's answer (the page never shows stored data) and
  after every FRESH fetch (not an in-process cache hit) writes, in one short
  `unit_of_work` after the Blizzard calls, under a per-character advisory lock:
  - `wow_character` — keyed by Blizzard's character id (a rename moves the
    slug and keeps history; a different live character under the slug is
    marked gone first). `sheet` = the `CharacterResponse` JSON, a render cache
    only (never filtered); a section Blizzard failed to send keeps its stored
    value (`character_sheet_merge.py`). Bump `CHARACTER_SHEET_VERSION` when a
    `CharacterResponse` change makes old sheets mean something else, then the
    `SHEET_SCHEMA_HASH` pin in `tests/test_wow_character_store.py` (it fails
    on any schema change). A sheet of another version or that no longer
    validates reads as None.
  - `wow_character_daily_metric` (one row per character per UTC day, upserted;
    `None` keeps the day's earlier value, never 0) + `wow_character_profession_skill`
    (replaced only when Blizzard sent the professions). Numbers:
    `character_metrics_mapper.py` (statistics 1197 total kills, 1487 killing
    blows, 60 deaths; absent = 0, failed call = None).
  - A 404 marks a stored character `gone_at` (cleared when it answers again);
    nothing is stored for a name Blizzard never answered. Other failures set
    `last_error`. A storage error is logged and never breaks the page.
  - `purge_wow_character_metrics` (daily, always on): rows older than 400 days,
    each character's newest kept. Tests: `tests/test_wow_character_store.py`.
  - Guild + recipes (migration 0055): each store upserts the profile's guild
    (`wow_guild`, keyed by Blizzard's guild id, slug unique among live) and sets
    `wow_character.guild_id` (`guild_rank` kept only while the guild is the
    same); recipes go to `wow_recipe` (id + name, shared) + `wow_character_recipe`
    (replaced only when Blizzard sent the professions).
- Guild roster refresh (`services/wow/guild/guild_roster_service.py`, job
  `refresh_wow_guild_rosters`, every 30 min, always on): a guild is WATCHED
  while a person looked up a member within 14 days (`last_viewed_at`, set only
  by `get_character(viewed=True)` — the job's own look-ups pass `viewed=False`,
  so a member moving to another guild never starts watching it; a page
  look-up served from the cache still stamps it via `record_view`). Up to 5
  due guilds per run (roster older than 6 h, never-asked first): Blizzard
  `/data/wow/guild/{slug}` + `/roster` (namespace `profile-forever-us`, no
  realm), then the members NOT refreshed in the last 6 h through
  `character_lookup_service` 4 at a time, at most 200 member fetches per run
  across guilds (`GUILD_ROSTER_MAX_MEMBER_FETCHES_PER_RUN`; ~11 Blizzard calls
  each, quota shared with AH prices and page look-ups — a big guild finishes
  over later refreshes), then one transaction: member count (entries listed)
  + `character_repo.apply_roster` (members = exactly the roster by Blizzard
  id, with rank — an entry with an unusable slug keeps its member, just isn't
  fetched; members not stored because their profile 404s are skipped).
  Two 404s in a row (`GUILD_NOT_FOUND_ERROR` in `last_error`) or the name given
  to another guild → guild gone, members guildless; other failures, or a
  roster under half readable → `last_error`, roster kept. A guild raising
  unexpectedly is recorded and the run goes on; a 429 ends the run.
  Live: topdeadcenter = 52 on the roster, ~40 profiles answer, ~18 s per run.
  Tests: `tests/test_wow_guild_roster.py`.
- Guild page (`GET /api/wow/guilds/{slug}`, `api/wow_guilds.py`, own per-IP
  limit `GUILD_RATE_LIMIT`/min): stored data only, never calls Blizzard. 404
  `guild_not_found` for a slug never stored or impossible. `guild_repo.members`
  joins each member's newest daily metric (level, item level) with a LATERAL
  one-row index read, and names the class from `class_id`
  (`CLASS_NAMES_BY_ID`) — never from the stored sheet; the live guild
  wins over a gone one with the same slug. `refresh_failed` = `last_error` on a
  live guild; a gone guild lists nobody. The character sheet carries
  `guild_slug` so its guild badge links there. Frontend:
  `pages/WowGuildPage.tsx`, `components/guild/`, `lib/guild/guildMembers.ts`
  (filter/sort; a missing value always sorts last, never as 0); search, class,
  level band and sort live in the URL (`GUILD_PARAMS`, defaults left out,
  `replace` so Back skips keystrokes). Tests: `tests/test_wow_guild_page.py`,
  `src/__tests__/wowGuildPage.test.tsx`, `e2e/wow-forever-guild.spec.ts`.
- Frontend: `pages/WowCharacterPage.tsx`, `components/character/`,
  `lib/character/`. Names are remembered per browser only after a successful
  load (`mga.wowForever.character.v1`, 5 max); `/wow-forever/character`
  opens the newest. Gear is a paper doll (`PAPER_DOLL_*` in
  `data/character/characterConfig.ts`); "Use for MGA's pages" writes the
  character's faction, class and level to `usePlayerSettings`.
- Stats panel (`CharacterStatsPanel`, lines from `lib/character/characterStats.ts`):
  Blizzard's own totals from `/statistics` — never recomputed. Retail
  leftovers (mastery, versatility, lifesteal, avoidance, ratings) are dropped
  in the mapper. Weapon damage only for a hand that holds a weapon (Blizzard
  reports an unarmed off hand behind a two-hander). Green "+N" = effective −
  base (gear, talents, buffs). Haste, expertise, penetration show only when
  non-zero; run speed only when not 100%; mana regen only for mana users.
  Armor/Defense live in the Defenses tab only. A failed `/statistics` call
  gives `stats: null` (logged, not cached) instead of failing the sheet. Tab default by class (casters Spell,
  hunter Ranged, else Melee); a picked tab is remembered
  (`mga.wowForever.character.statsTab.v1`). `stats: null` = Blizzard has none
  yet. Tests:
  `tests/test_wow_characters.py`, `src/__tests__/wowCharacterPage.test.tsx`,
  `src/__tests__/wowCharacterStats.test.ts`, `e2e/wow-forever-character.spec.ts`.
- Talents (`CharacterTalentsPanel`, `lib/character/characterTalents.ts`):
  `/specializations` keeps only each talent's id + rank per saved set (active
  first, empty sets dropped); names, icons and rank text come from the talent
  calculator's own tree files (same Blizzard ids), loaded with `useTalentClass`.
  Drawn as the game's talent frame, read only (`CharacterTalentTreeView` /
  `CharacterTalentCell` on the calculator's shared `TalentTreeCard`,
  `TalentCellFace`, `TalentTreeSkeleton`): three grids side by side, tabs
  below `lg` opening on the main tree (`lib/talents/mainTree.ts`); a click or
  tap opens the talent's rank text under the trees (again / Escape closes),
  never adds or removes a point. Point split in the class's tree order. "Open in the talent
  calculator" links `?b=2-…&lvl=<level>` only when `isLegalBuild` holds and the
  level has the points — otherwise a note says why. `talents: null` = the call
  failed (logged, not cached; the sheet still shows); a 404 = no points yet
  (`groups: []`). Unknown ids are counted in a footnote, never guessed.
- Professions (`CharacterProfessionsPanel`, `lib/character/characterProfessions.ts`),
  between Stats and Talents: `/professions` gives each profession's skill, its
  rank's cap and the known recipes (`{id, name}`). The id is the client's
  `SkillLineAbility` row (Bolt of Linen Cloth = 2359), NOT the spell (2963):
  `recipeSpell` maps it through `data/character/recipeSpells.json`
  (`scripts.wow_professions.abilities`, in the refresh). Test fixtures must use
  ability ids, or a coincidental spell-id match colours the wrong recipe. Main
  and secondary groups; one card open at a time, a card opens only when it
  lists more than one entry (Fishing knows just "Fishing"). A crafting
  profession's recipes are coloured at the character's skill from its recipe
  file (`useCraftingData`, loaded when the card opens; `recipeColorAt` on
  `skillColors`): Orange / Yellow / Green / Gray groups, then "Other" for ids
  not in the file and for `NOT_A_RECIPE_SPELLS` (Disenchant gives no
  skill-ups). Cooking has no spell-id join yet (`foods.json` is keyed by food
  item), so it and any other non-crafting profession list their recipes
  uncoloured — never matched by name. Each open card links our guide
  (`?p=<guide>`, plus `&skill=` for crafting guides). Blizzard ids map to
  guides through `PROFESSION_SKILL_LINES`. `professions: null` = the call failed
  (logged, not cached); a 404 = none learned (empty lists).

- Reputation (`CharacterReputationPanel`, `lib/character/characterReputation.ts`),
  after Professions: `/reputations` gives each faction met with its standing
  (`tier` 0 Hated … 7 Exalted) and progress (`value` / `max`; `max` 0 = at the
  cap, so no bar or numbers). Grouped under the game's reputation-pane headers
  from `data/character/reputationGroups.json` — **GENERATED** by
  `python -m scripts.wow_reputation.build` from Forever's own Game Data API
  (`reputation-faction` index, header `side` from `player_faction`; runs in the
  data refresh). The character's side first, then shared headers
  (Steamwheedle), then the other side; a faction under no header, or newer than
  the file, goes in "Other" — never dropped. First header open, others open
  beside it. A Steamwheedle town at Hostile or worse warns its guards attack.
  `reputations: null` = the call failed (logged, not cached); a 404 = none met.

- PvP (`CharacterPvpPanel`, `lib/character/characterPvp.ts`), last on the
  sheet and closed by default (`CharacterCollapsibleSection`; the heading
  carries "Unranked · 21 honorable kills"). `/pvp-summary` gives `pvp_rank` and
  honorable kills; deaths to players (statistic 1501), to the other faction
  (318) and the continent with the most kills (1458, name in `description`)
  come from `/achievements/statistics`, read by id
  (`character_achievement_statistics.py`). A statistic the character never moved
  is absent = 0; the whole pane failing = those fields null (left out of the
  list), never 0. Rank shows "Rank N" with no title until a ranked Forever
  character shows its scale. `pvp: null` = the summary call failed (logged, not
  cached); 404s = zeros. Empty-section notes use `CharacterSectionNote`.

- Collections (`CharacterCollectionsPanel`, `lib/character/characterCollections.ts`),
  after PvP and closed by default ("2 mounts, 4 pets"): names only, A–Z, one
  line per mount or pet species ("Pachimari ×2" when learned twice). Blizzard
  may share these account-wide, so they are never compared between guild
  members. `collections.mounts` / `.pets` null = that call failed (logged, not
  cached, the other list still shows); a 404 = none (empty list).

- Dungeons (`CharacterDungeonsPanel`, `lib/character/characterDungeons.ts`),
  before PvP and OPEN by default ("8 of 25 tracked done"): every dungeon/wing,
  Classic and Forever's own, in level order. Done = the final boss's Blizzard
  "Boss Kills" statistic (category 14821) is above zero; kills = the larger of a
  boss's ids (Rivendare is counted under two; the build fails if one row's ids name
  different bosses), never the sum. Cathedral = Mograine (1093): Whitemane's id is
  retail's map 1001. Wings
  whose last boss has no statistic (SM Graveyard/Library/Armory, DM East/West,
  Strat main gate, four Forever dungeons) show "Not tracked by Blizzard" — never
  "Not done". The list is `backend/data/wow/character_dungeons.json`, built by
  `python -m scripts.wow_character_dungeons.build` (curated in
  `scripts/wow_character_dungeons/dungeons.py`; fails if an id stops being a
  Boss Kills statistic in the client; Classic levels from `classicDungeons.json`,
  Forever ranges hand-entered; in `wow_refresh`). "Fits you now" = not done (or not
  tracked), enterable and within 2 levels of the range; below the level to enter = dimmed
  "needs level N". Classic rows link their guide page. `runs` = statistic 932.
  `dungeons: null` = the statistics call failed — never every dungeon "not done".

#### In-game icons (`GameIcon`)

- `components/shared/GameIcon.tsx` (`icon`, `size` 16/24/32/48, `alt` — "" when
  the name is printed next to it) shows an item/spell icon in a frame ringed in
  the item's quality colour, lazy-loaded; no icon or a failed load = a same-size
  neutral placeholder. Look-ups: `lib/icons/wowIcons.ts` (`itemIcon`,
  `spellIcon`, `recipeIcon`, `fileIcon`, `professionIcon`, `classIcon`, `iconUrl`) against
  `data/icons/wowIcons.json` — **GENERATED** by `python -m scripts.wow_icons.build`
  (item → `Item.IconFileDataID`, else its default appearance's icon; spell →
  `SpellMisc`; profession → its SkillLine's icon in `skills`, keyed by
  `data/professions/professionSkillLines.ts`; class → `classDetails.json`; quality from
  ItemSparse. Item, ItemSparse and the appearance tables all take the client hotfix
  cache (`--hotfix-cache`), so an item Forever re-skinned shows the in-game icon, not
  Classic's; the build is pinned in the file). Covers
  the crafting / gathering guides' items and spells, the Cooking ingredients and
  every item in `items.json` (Best gear, Item Compare, item pages) — and every other
  Forever item (all ItemSparse rows), so any page that names an item by id can show its
  icon. Print an item name with its icon via `ItemIcon` / `ItemNameList` / `ItemCountList`
  (`components/shared/`) or `ItemNameLink withIcon`; a name with no id is a data bug —
  make the generator emit the id (skinning `leatherIds`, gold farms `clothId`/`skinId`).
  Classes and professions show their icon wherever they are picked or headed (class
  links and chips, macro / gold class headings, profession picker, gold gathering
  tiles); `SegmentedToggle` options take an optional `icon` (`types/segmentedOption.ts`).
  Every class drop-down is `components/shared/ClassSelect` (the picked class's icon
  beside a native select; optional `classes` subset and `allOption`) — never hand-roll one.
  Talent trees, talents, racials and pet abilities use `fileIcon` on their generated
  `icon`; `wowPickerIcons.test.tsx` fails if one of those ids isn't published.
- Images are the client's BLP icons as 64px WebP, uploaded by
  `python -m scripts.wow_icons.publish --to r2` (needs `scripts/.env.r2`;
  skips what's already there) to `wow/{build}/icons/{fdid}.webp`, and served
  same-origin by `GET /api/wow/icons/...` (`app/api/wow_icons.py`,
  `services/wow/icon_service.py`) — works in the Discord Activity and needs no
  CSP change. Both run in `wow_refresh`; publish before the refresh PR merges.
  Never commit the images; never use another site's icon files.
- `WowLegalNotice` (Blizzard trademark + "icons and map art © Blizzard" notice)
  renders once under every WoW Forever page via `withLegalNotice` in `routes.tsx`.

#### Auction-house prices (frontend)

- Nobody types prices: `hooks/useAuctionPrices.ts` (one RTK Query cache,
  `api/wowPricesApi.ts`, `GET /api/wow/prices`) feeds every price on
  the crafting guides, the Cooking route, the food picker + detail ("Buy or
  cook?") and the gold farm cards. Columnar response in copper, mapped once by
  `prices/auctionPrices.ts`. An item the source lacks reads "no auction price",
  never 0.
- **Whose house:** a server's house for one faction (`PriceHouse`, the RTK
  query arg `{ server, faction }`). The server is `DEFAULT_PRICE_SERVER`
  (`pvp`, the only mapped one — `data/priceServers.ts`); there is no server
  picker and no server in any URL until a second server is mapped. The
  faction follows the player's saved faction (`usePlayerSettings`, the World
  Map's `faction`: A → `alliance`, H → `horde`; `prices/priceFaction.ts`).
  `useAuctionPrices(faction?, server?)` reads RTK Query's `currentData`, so a
  house switch never shows the old house's prices. Blackwater (`neutral`) is
  picked only on the Auction house page and lives only in its URL. Every
  surface names the house with `priceHouseLabel` ("PvP · Alliance").
- Every priced surface shows `PriceStatus`: a skeleton, then the credit
  ("Prices from Blizzard (PvP · Alliance AH, US) · updated X ago", plus
  "these may be out of date" past `PRICE_STALE_HOURS`), "No PvP · Alliance
  auction prices yet …" when the house has none, or "Couldn't load prices —
  …" with a retry.
  Prices are US only: there is no price region select, and prices never read
  the server status region (`hooks/useWowRegion.ts`,
  `mga.wowForever.serverStatus.region.v1`, which only server status uses).
- Auction house page (`/wow-forever/auction-house`, `?q=` search, `?house=`,
  replace-history): an "Auction house" Alliance / Horde / Blackwater switch
  (`AuctionFactionSwitch`, `hooks/useAuctionHouseFaction.ts`) — Alliance or
  Horde saves the player faction (every priced page follows) and drops
  `?house`; Blackwater sets `?house=neutral`. Each row: market value,
  cheapest, on sale ("23,980 in 910 auctions", `onSaleText`). Filter/sort is
  the pure `prices/auctionSearch.ts` (default "Most on sale"; 50 browse /
  200 search cap).
- Auction house profession filter (`?prof=<crafting profession>`, replace;
  `?recipe=<spell id>`, push to set / replace to clear; changing `prof` drops
  `recipe`; `hooks/useAuctionMaterialFilter.ts`): `AuctionProfessionSelect`
  narrows the list to that profession's reagents (`ProfessionAuction` loads its
  crafting JSON; `lib/auctionHouse/professionMaterials.ts` — search caps at 200
  and counts materials with no auctions). `RecipeFinder` (every typed word,
  8 matches, labelled with the yellow skill) opens `RecipePricePanel`: each
  material's market value × count, the total ("at least …" when some have no
  auctions), what the made item sells for, and the difference (`craftProfit`,
  only when everything is priced; enchants make no item). An unknown `?recipe`
  says "wasn't found"; an invalid `?prof` is ignored.
- MGA Prices addon (`frontend/addon/MGAPrices/`, Interface 16001; inside the
  frontend so the caddy image's build context has it): item tooltips show the
  player's faction house price (×stack on a bag stack, cheapest · on sale),
  every house while Shift is held; soulbound items with no price stay quiet;
  on your-house view a verdict line: "Sell on AH +X over vendor" when the
  market value after the house's cut (`cut` per house in `Data.lua`, from
  `AUCTION_CUT`) beats the client's vendor price (`GetItemInfo` 11th return)
  by >10% (`AH_BEATS_VENDOR_BY`, covers deposit risk), else "Vendor it"; "vendors
  won't buy it" at vendor price 0; no line while the client hasn't cached it;
  warns once prices are a day old; `/mgaprices` prints what's loaded. Addons
  can't go online, so the Auction house page's folded "Get these prices in your
  game tooltips" card (`PricesAddonCard`, `hooks/useDownloadPricesAddon.ts`)
  fetches all three houses and zips the addon (fflate, `lib/auctionHouse/pricesAddonZip.ts`)
  with a generated `Data.lua` (`lib/auctionHouse/addonPriceLua.ts`:
  `items[id] = {market, cheapest, on sale}`); the repo's `Data.lua` is an empty
  stand-in. Crafting demand on materials (`lib/auctionHouse/reagentDemand.ts`,
  thresholds in `data/auctionHouse/reagentDemandRules.ts`; the download loads
  every profession via `loadAllCraftingData`): `reagents[id]` = `{vendor = true}`
  (tooltip just says "sold by vendors" — crafting can't push those) or the
  leveling routes that use it (route recipes' reagents plus one level down
  through the profession's own makers/smelts, each profession's full span,
  2 named then "+N more") with a recipe count fallback; per house
  `crafts[id] = {recipe, profit}` = the best craft that pays after the house's
  cut (5%, Blackwater 15%), only for widely known recipes (no rare-drop
  patterns), made items with ≥5 auctions, profit ≥1s and ≥10% of the materials.
  Per house `wanted[id] = {recipe, count, sells}` (`mostWantedFor`) = the most
  valuable product the material goes into there (rare patterns included, not
  enchants, ≥5 auctions, selling for more than the material it uses — so
  Essence of Air → Fire doesn't count): the tooltip's "Wanted for | Runecloth
  Bag x5 · sells 7g 24s" says why a dear material's price is held up even when
  no craft pays; hidden when it's the same recipe as "Crafting pays".
  No price history exists, so the tooltip never claims a price WILL rise.
  Chat (`MGAPrices.lua`): a `ChatFrame_AddMessageEventFilter` on chat/loot
  events writes your house's market value after each item link (display only;
  `/mgaprices chat` toggles, saved in `MGAPricesSettings` via the .toc's
  SavedVariables); hovering an item link in a chat frame (incl. whisper windows,
  `FCF_OpenTemporaryWindow`) shows GameTooltip. Item tooltips are priced from
  all three client paths (TooltipDataProcessor, OnTooltipSetItem,
  `hooksecurefunc(SetHyperlink)`), deduped per item — a clicked link always
  gets priced. A clicked BoP link with no price says "can't be sold"; hovered
  soulbound items stay quiet. `src/__tests__/wowPricesAddon.test.ts` runs the real Lua under
  fengari against WoW stubs (`src/test/addonLua/`; they mirror the Forever
  client, which has only `C_Item.GetItemInfo`, no global `GetItemInfo`).
  Refresh = download again, or the PC updater (`frontend/updater/`, see its
  README): `npm run build:prices-updater` bundles `refreshPricesAddon` (same
  `addonPriceLua` + bundled recipe data) into one Node file that an hourly
  scheduled task runs to rewrite only `Data.lua`; tested in
  `updater/__tests__/refreshPricesAddon.test.ts`.
- Material prices fill in automatically (`CraftPriceField` shows the price as
  its value, labelled "Auction house"). An item with no auction price is
  worked out in `crafting/derivedPrices.ts` — an essence from the other half of
  its pair, or an item another profession makes from its reagents (`makers` in
  the generated crafting JSON, `maker_records` in `build.py`), only when every
  reagent has a price. Precedence: yours > auction > worked out. Still nothing
  = "Not on the auction house yet", never a request to type one. Route lines
  show each material's unit price from the same price book as the totals.
- Typed prices are optional overrides (`mga.wowForever.professions.priceOverrides.v2`,
  priced professions only); the pre-auction key `...prices.v1` is removed on read.
- Tests stub the hook with `src/test/auctionPricesStub.ts`; E2E stubs
  `**/wow/prices**` per house (`e2e/wow-forever-auction-prices.spec.ts`;
  specs that only need "no prices yet" use `e2e/fixtures/emptyPrices.ts`).
  `e2e/wow-forever-prices-api.spec.ts` checks the live endpoint.

#### Feature requests (anonymous; Claude-refined; operator-only triage)

- Visitors submit a request in their own words; Claude (Haiku,
  `CLAUDE_FEATURE_REFINER_MODEL`, one forced `record_feature_request` tool call)
  returns `new` (a PRIVATE `submitted` story), `duplicate` (linked to an existing
  public story + the submitter's vote), `needs_clarification` (one question; the
  follow-up — answered OR an empty "Skip, submit as is" — is always refined,
  never asked again) or `rejected` (private reason). Backend:
  `app/api/wow_features.py` (public), `app/api/wow_feature_triage.py` (triage),
  `app/services/wow/feature_requests/`, models `wow_feature_story` /
  `wow_feature_submission` / `wow_feature_vote` (migration 0049).
- `POST /api/wow/feature-requests` gating order: availability (503
  `feature_requests_unavailable` — same rule as the item reader, cap
  `WOW_FEATURE_REQUEST_DAILY_CAP`) → per-IP 5/h + 20/day → Turnstile →
  validation → inbox guard (503 `feature_inbox_full` at 500 untriaged) → same-text
  reuse (no Claude call) → durable daily cap on its own bucket → Claude (no DB
  transaction held) → write transaction (target re-read `FOR UPDATE`, follows
  `merged_into` once). Claude's output is untrusted: enums enforced,
  `duplicate_of` must be a short id that was in THIS prompt (≤200 public
  candidates), length caps, links / markup / `@names` dropped
  (`feature_response_mapper`).
- Public responses never carry `raw_text`, `priority`, `ip_hash`, `voter_key`
  or submissions (`tests/test_wow_feature_requests_api.py` checks every key).
  Votes: no Turnstile (they work in the Discord Activity), 60/h per IP, one per
  browser (`voter_key` = HMAC of the localStorage client id) and ≤3 per network
  (IPv4 / IPv6 /64) per story.
- Triage: `/api/wow/feature-requests/triage/*`, mounted in BOTH modes, gated
  at router level by `current_superuser` — the operator's normal sign-in
  (JWT Bearer; TOTP at login if enrolled). No session → 401, a non-superuser →
  403. `Cache-Control: no-store` on every triage response; the audit actor is
  the operator's user id (`changed_by` from the JWT). PATCH and merge require
  `If-Match` = the story's `updated_at` (428 / 400 / 412 `story_changed`).
  Runbook: `docs/wow-forever-feature-triage.md`.
- Triage screen `/wow-forever/triage` (frontend, own lazy chunk, noindex,
  unlinked): `pages/WowTriagePage.tsx` + `components|lib|hooks|data|types/
  featureRequests/triage/`. Endpoints are injected into the app's `baseApi`
  (`api/triageApi.ts`, `keepUnusedDataFor: 0`; Sign out resets `baseApi`, so
  no private row survives it); every call goes through `triageRequest.ts`
  (shared axios + Bearer, fetch adapter: no-store, no referrer, keepalive
  writes). Signed out → `/login` with `state.from` = the triage URL
  (`TriageAuthGate`); a 401 mid-session clears the session (shared
  interceptor) and does the same; a 403 says the account isn't the operator.
  Every Sign out (screen, shell) goes through `signOutAfterSaving`
  (`lib/auth.ts` + `lib/pendingWrites.ts`), which sends writes still in their
  undo window before the token is cleared. Refuses to run framed / in the
  Discord Activity. Player text is rendered as text nodes in
  `TriageSubmissionQuote` with hidden characters revealed
  (`revealHiddenChars.ts`). Approve / Not planned / Hide are delayed with Undo
  (`useDelayedAction`, flushed on pagehide); Merge confirms and is immediate.
  Tests: `src/__tests__/wowTriage*.test.ts(x)`, `e2e/wow-forever-triage.spec.ts`,
  `e2e/serve-only-operator.spec.ts`.
- Retention: scheduler job `purge_wow_feature_submissions` (daily) and
  `python -m app.cli purge-wow-feature-submissions`.

#### "Ask" chat relay (`POST /api/wow/chat/turn`)

- A stateless relay: the browser sends the whole conversation, the server adds
  its own system prompt, tools, model and `max_tokens`
  (`app/services/wow/chat/chat_tool_schema.py`, prompt-cached) and returns
  Claude's next message + a signed ticket. The BROWSER runs the tool calls
  (`search_npcs`, `find_places`, `search_items`, `dungeon_info`,
  `get_player_context`, `find_rares`, `profession_guide`, `gold_farming`,
  `find_macros`) against its bundled data — and `auction_prices` /
  `server_status` against the site's own `/api/wow/prices` and
  `/api/wow/server-status` — and sends the results back. Tool
  definitions go out on every turn: `test_wow_chat_schemas.py` caps their size
  and checks the profession / class / sort / region enums against
  `wow_chat_enums.py`, `SERVER_STATUS_REGIONS`, `PRICE_FACTIONS` and
  `PRICE_SERVERS` (`auction_prices` takes an optional `faction` and
  `server`, default `pvp`; no region: prices are US only).
  Nothing is stored; logs carry codes and counts, never message text.
- Gating order: `BodySizeCapMiddleware` (413 `chat_body_too_large` > 64 KB,
  before parsing) → availability (503 `chat_unavailable`, same rule as the item
  reader, both token caps) → continuation: ticket signature / expiry / network
  / rounds left, then per-IP 60/h; new message: per-IP 20/h + 60/day, then
  Turnstile (action `wow-chat`) → strict transcript rules
  (`chat_transcript.validate_turn`, `extra="forbid"`, text / tool_use /
  tool_result blocks only) → ticket digest = the history this server answered
  → durable token budgets (global `wow-chat` + per network
  `wow-chat-ip:<hmac>`, reserved before the call, settled from Anthropic's
  usage, released on failure) → Claude → reply filtered to known tools.
- Ticket: `base64url(payload).base64url(HMAC)`, key HKDF'd from
  `SECRET_KEY`; payload = network hash (IPv4 or IPv6 /64), expiry (15 min),
  tool rounds left (3; the last round runs with `tool_choice: none`) and the
  conversation digest. Limits and error codes: `app/core/wow_chat_limits.py`.
  Tests: `tests/test_wow_chat_api.py`, `test_wow_chat_ticket.py`,
  `test_wow_chat_schemas.py`.

#### "Ask" chat page (`/wow-forever/ask`)

- `pages/WowAskPage.tsx` + `components|hooks|lib|data|types/ask/`. The hub's
  `HubAskBox` sends to `/wow-forever/ask?q=`; the page sends it once and drops
  `?q` (replace history). Offered only where the item reader is
  (`isHumanCheckedFeatureOffered`), browser-only inside the Discord Activity.
- **Tools run in the browser** (`lib/ask/runAskTool.ts` → `lib/ask/tools/`),
  reusing the site's own code — never a second search: `searchAllNpcs` +
  `viewMapSearch` (nearest, `usableBy` faction), `findPlaces` / `bestPlaces`,
  `searchItems`, `loadDungeons`; the guide tools reuse the pages' own logic:
  `fitsLevel` + `rankRares` (the zone's rares, then its continent's),
  `resolveRoute` / the hand-written routes (`loadProfessionRoute`,
  `professionRouteRows` — crafts and materials from the player's skill),
  `farmsFor` + `tipsForLevel` (gold an hour is VENDOR prices), `searchMacros`
  over `ALL_MACROS` (the card shows the macro text; Claude only gets titles).
  Rares, gold farms and crafting data load on first use. The live tools call
  the pages' own RTK Query endpoints outside React (`lib/ask/askLiveData.ts`,
  same cache): `auction_prices` (US only; the PvP server's house for the
  player's faction unless Claude passes `faction` / `server`) = `mapPriceList` + the Auction house
  search, exact name first (`askPriceMatches`), whose house it is, market
  value and cheapest only as formatted, units on sale, how old the prices are
  and a "more than 12 hours old" note (`pricesAreOld`, `PRICE_STALE_HOURS`);
  no prices for that house, no match, or a failed load each come back as a
  note / error telling Claude not to guess.
  `server_status` (the saved region, `useWowRegion`, unless the player named one) lists each ruleset up / down + when it was checked; a
  failed check (502) is an error saying never to call the servers up or down. No level said or
  saved = a "level not set" result and no card. Input is checked against the schema
  (`validateAskToolInput`); results are capped under the relay's 4 KB. "From"
  comes from the place named in the question, else the saved World Map
  location (`resolveAskOrigin`); an unknown place is said so, never swapped.
  The World Map is `useWorldMap` (Classic + "Seen in game" captures), the
  same merged data the map page uses. `search_npcs` plans a route (the World
  Map's `planDirections`, walk graphs via `loadAskWalkGraphs`) to the
  `TRIP_CANDIDATES` straight-line nearest and orders by its travel seconds
  (`lib/ask/askTrip.ts`); each row's `distance` is "about N min, ~Y yd" and
  `route` the real steps ("walk → fly to X → boat to Y"), which is the only
  travel Claude may describe (SYSTEM_PROMPT). `rankPois` itself is plain
  nearest-yards (no capital bonus), so list order = shown distance.
- Turn loop `lib/ask/askTurnLoop.ts` (pure; question with the human check,
  tool results with the ticket); state `hooks/ask/useAskChat.ts`: a failed
  question rolls back and offers Try again (counting down Retry-After),
  daily cap = no button, expired chat = New chat (Undo for 10 s), Cancel puts
  the question back in the box. Finished questions persist in sessionStorage
  (`lib/ask/askStorage.ts`, re-validated on read). Turnstile action `wow-chat`,
  one token per question (`useAskTurnstile`).
- Mini-map pins (`lib/ask/askMapPins.ts`) reuse the World Map's
  `clusterMarkers`: results that overlap are one "×N" pin; the picked row is
  never grouped and is drawn red.
- Cards (`components/ask/cards/`): NPC results with a mini map and numbered
  rows; picking a row shows **Route there** =
  `/wow-forever/map?faction=<A|H>&to=npc:<id>&dir=1`, plus `&from=pt:<zone>,x,y` ONLY when
  the start came from the player's message (`lib/ask/askLinks.ts`, the World
  Map's own `formatEndpoint`). `faction` is the faction the search planned its
  routes as (`AskNpcCard.faction`); the World Map honours `?faction=` for that
  visit only (`hooks/useFactionOverride.ts`), never writing the saved faction,
  and picking a faction in the You section drops it. A picked row that shares
  its spot with a "×N" pin pushes that pin aside (`AskPin.nudged`). Places, items (`ItemNameLink`), dungeon, "Where
  are you?". Rares and gold farm spots share `AskSpotsPicker` (mini map,
  numbered rows, Route there = `to=pt:<zone>,x,y`, rares also "Show on the
  World Map" = `rareMapHref`); profession steps; macros reuse `MacroCard` (Copy
  button); prices (`PricesCard`, "Auction prices · PvP · Alliance AH": rows + the
  Blizzard credit via `PriceCreditLine`, shared with `PriceCredit`, with its
  old-price warning; "Open the Auction house" carries `?house=`; "Couldn't
  load" with no figures) and server status (`ServerStatusCard`: `SummaryLine` +
  `ServerRulesetList`, shared with the server status section; Blizzard
  unreachable is never "down"). Each guide card links to its page (`lib/ask/askGuideLinks.ts`) —
  offered, never followed for you. Every empty-state example is checked against
  real data in `wowAskTools.test.ts` / `wowAskGuideTools.test.ts` (no live-data
  examples: they'd depend on today's prices). Live tools: `wowAskLiveTools.test.tsx`. Tests:
  `src/__tests__/wowAsk*.test.ts(x)`,
  `e2e/wow-forever-ask.spec.ts` (relay mocked).

#### Food picker (`/wow-forever/food`, "What should I eat?")

- Level + class + spec + activity (Leveling / Dungeon / Raid / PvP / Fishing /
  Just healing) + optional Cooking skill → best pick, runners-up (same-effect
  foods folded into one row), "Worth training for" (better but above your
  skill) and "Next upgrade at level N". Settings live in the URL
  (`?lvl&class&spec&act&skill`, replace-history) and
  `mga.wowForever.food.settings.v1`; first visit seeds level/class from the
  World Map player settings.
- **Data is GENERATED** — `python -m scripts.wow_food.build` (from `backend/`)
  writes `data/food/foods.json` from the Forever client (SkillLine 185
  recipes → created item → its use spell → Food/Drink + Well Fed spell). Buffs
  are parsed from the client's evaluated tooltip text (`scripts/wow_food/tooltip.py`
  evaluates `$s/$o/$t/$d/$@spelldesc` tokens), never from aura codes.
  `data/food/classic/trainerSkills.json` (trainer recipe skill) is cmangos
  GPL data — keep its LICENSE + README. `tests/test_wow_food_generator.py`.
- Ranking (`food/`, pure, unit-tested): leveling uses the class leveling rule
  of thumb; other activities use Pawn's Classic spec weights. Attack power
  counts once (max of melee/ranged), healing only for healers, a healer's
  `spell_power` never counts as spell damage, PvP lifts Stamina to your main
  stat's worth. Feasts only for Dungeon/Raid. The +5% kill-XP carries the
  Unconfirmed badge (conditions unpublished).
- **Food detail** (`/wow-forever/food/:foodId`, `pages/WowFoodDetailPage.tsx`):
  every food name in the picker links here, carrying the picker query so Back
  returns to the same answer. Shows what it does, how to learn it (skill
  learn/green/grey; vendors, quests, drops, containers), each ingredient's
  sources, and what to cook it at (`focus`: Cooking Fire / Forever's Iron Oven).
  Vendors: player faction (World Map settings) + neutral first, other faction
  behind a toggle; Directions go to `/wow-forever/map?to=pt:<zone>,<x>,<y>&dir=1`
  (vendors aren't World Map POIs, so `npc:` doesn't resolve). Each farmable
  mob carries a spot — its densest pack (spawns within 150 yd) in the zone it's
  most common in — with the same Directions link. Reagents you can
  buy, fish or open from a container hide their mob-drop list.
  Sources are `data/food/classic/recipeSources.json` — cmangos Classic data
  from `scripts/wow_food/recipe_sources.py`, GPL, same LICENSE. Items with id
  ≥ 100000 are new in Forever and have no source data.

#### World Map (`/wow-forever/map`)

- Frontend-only, static data under `src/games/wow-forever/data/worldMap/`, logic
  in `src/games/wow-forever/worldMap/` (pure, unit-tested), page in
  `pages/WowWorldMapPage.tsx`. Player choices (faction/class/zone/level/position)
  live in localStorage key `mga.wowForever.worldMap.player.v1` — preferences
  only, never world data.
- **Data is GENERATED — never hand-edit the JSON.** Re-run from `backend/`:
  `python -m scripts.wow_world_map.build [--no-art]`. Sources are pinned in
  `scripts/wow_world_map/sources.py` (wago.tools DB2 export of the Forever
  client for zones/flight paths/map art/factions; cmangos classic-db at a
  pinned commit for NPCs). `tests/test_wow_world_map_generator.py` checks the
  coordinate conversion against wiki NPC positions and the committed output.
- **Licensing:** `data/worldMap/classic/` is derived from cmangos classic-db,
  GPL-3.0 — keep its LICENSE + README (commit SHA) next to the data. No cmangos
  code is copied; no Questie/ForeverGuide/Wowhead data. Every Classic row
  carries a Classic data badge in the UI (`poiProvenance`).
- **Map art:** `frontend/public/wow-maps/<uiMapId>.webp` (WebP q70, 1002×668,
  fully explored) stitched from the Forever client's map tiles — © Blizzard
  Entertainment, shown for reference in a free fan tool. One image loads per
  viewed zone. See `public/wow-maps/README.md`.
- **Satellite view** (P4; `MapStyleToggle` "Map / Satellite", bottom-left of
  the map box, 44 px radio group): each zone's and city's ground from the
  Forever client's own top-down **minimap tiles** (continent WDT `MAID` chunk →
  512 px BLP tiles), stitched by `python -m scripts.wow_satellite.build` (from
  `backend/`; `grid.py` = ADT grid math, `wdt.py`, `render.py`) into ONE
  2004×1336 WebP per map cropped to exactly the drawn art's frame (the zone's
  UiMapAssignment rectangle) — so the viewer, markers, hit-testing and every
  overlay are unchanged; only the `<img>` under them swaps (`MapGround`).
  Per-zone, not per-continent: same bounds as the drawn art, one image per
  view. **Drawn-only:** the world, the continents, dungeon interiors and the
  underground capitals Ironforge / Undercity (`INDOOR_CITIES` — the minimap
  shows the mountain over them). The build writes
  `data/worldMap/satellite.json` (build + map ids, GENERATED); images live
  under the download cache and are NEVER committed —
  `python -m scripts.wow_satellite.publish --to r2` (needs `scripts/.env.r2`,
  skips existing keys, `--dry-run`) uploads them to `wow/{build}/satellite/`,
  served same-origin by `GET /api/wow/satellite/{build}/{uiMapId}.webp` (the
  icon route/service, kind `satellite`, strict regex allowlist; no CSP change).
  Both run in `wow_refresh`. The choice is `mga.wowForever.worldMap.style.v1`
  (`hooks/useMapStyle.ts`, default Map); a map with no satellite view hides
  the toggle and keeps the choice. The drawn art stays underneath while the
  satellite picture loads (spinner on the segment), then it fades in; a failed
  load falls back to the drawn map with "Try again". The viewer carries
  `data-map-style` and `group/viewer`, so `SATELLITE_*` classes
  (`data/worldMap/mapStyle.ts`) darken label / route halos and rim markers
  only on the satellite view. Tests: `tests/test_wow_satellite_generator.py`
  (grid math, crop, Farley's inn in its tile, idempotent publish),
  `wowWorldMapSatellite.test.tsx`, `e2e/wow-world-map-satellite.spec.ts`
  (set `MGA_SATELLITE_DIR` to the build folder for alignment screenshots).
- **Pan / zoom viewer** (`MapCanvas` → `hooks/useMapViewer.ts`): Leaflet 1.9
  (`CRS.Simple`), wrapped by our own hook — never react-leaflet (Hippocratic
  licence) and never Leaflet's controls. Leaflet is lazy-loaded
  (`lib/leaflet/loadLeaflet.ts`), so only the map page's chunk pulls it in.
  One art pixel = one unit at zoom 0, top-left (0, 0), y down = negative lat
  (`worldMap/mapViewport.ts`, pure + unit-tested against Leaflet's own
  projection); `MapViewport` (`types/mapViewport.ts`) is the page's view
  (`scale` 1 = the whole picture, `centerX/Y` 0..1). Zoom runs from the
  whole picture to `MAX_MAP_SCALE` (4×, `data/worldMap/mapViewer.ts`) — past
  that the art only blurs, so there are **no tiles**: the stitched WebP is
  already the client's full resolution. The picture (img + hover highlight +
  SVG markers, scaled by `scale` so markers keep their screen size) is a
  React portal into a div the hook owns: it fills the box straight away and
  moves into Leaflet's overlay pane once Leaflet loads
  (`attachMapPicture.ts`, ImageOverlay done with public API). Wheel
  (`attachWheelZoom.ts`, our own — Leaflet's fires after `remove()`), keys
  (`data/worldMap/mapViewKeys.ts`, handled in `MapCanvas`, Leaflet's keyboard
  is off) and the +/− buttons (`MapZoomControls`, bottom-right, 44 px) all go
  through `attachZoomQueue.ts`: Leaflet ignores a zoom or view asked for
  mid-animation, so the queue runs the newest one when the zoom under way
  ends — never call `map.setView` / `setZoom` around it. Unmounting mid-zoom
  removes the map only once that zoom lands (`removeMapWhenStill.ts`: Leaflet's
  `remove()` leaves the zoom's end timer running, which throws). Double-click and box
  zoom are off (a click opens a zone). Unzoomed, `touch-action: pan-y` lets a
  finger scroll the page; zoomed it's `none` and the finger drags the map.
  Tests: `wowWorldMapViewport.test.ts`, `wowWorldMapZoomQueue.test.ts`,
  `e2e/wow-world-map-viewer.spec.ts`.
- **Navigation like the in-game map.** `zones.json` carries every map's UiMap
  `parent` (Azeroth `947` → continents → zones → capitals), `levels` and
  `territory`; `decodeMapTree` builds the tree. The viewed map lives in the URL
  (`?m=<uiMapId>`, pushed on navigation so browser Back = zoom out); with no `m`
  the page follows the player's zone. Browsing never changes the saved
  position — only a click on your own zone's map (or a confirmed "Set position
  here") does. Zoom out = Esc, the breadcrumb's Zoom out button, browser
  Back, the −/Reset buttons, or "Zoom out to …" in the map menu. **Right-click
  no longer zooms out** (since P3) — it opens the map menu (see My marks).
- **Hit-testing** (`worldMap/mapHitTest.ts`, mirrors `C_Map.GetMapInfoAtPosition`):
  on a continent/world view the candidates are the children; on a zone view,
  its siblings. A candidate must cover the point with its mask
  (`mapMasks.json`, 120×80 bits from the zone's highlight art, zones only) —
  continents are covered via their child zones because their highlight art is
  only a coastline. Smallest area wins; a click that resolves to nothing never
  navigates.
- **Neighbour labels** (`worldMap/mapNeighbours.ts`): a zone's neighbours are
  the siblings its land actually touches — rays marched out from every border
  cell of its mask hit the first sibling outline (never a zone that is merely
  on the same picture). Each label sits on the side / at the point where that
  contact is. Labels live in a reserved band OUTSIDE the picture
  (`edgeLabelLayout.ts`, `MapEdgeFrame`), so they never cover markers, and are
  pushed apart / shared along the band so they never overlap —
  `wowWorldMapNeighbours.test.ts` checks every zone at several widths.
- **List ↔ map selection** (`hooks/useMapSelection.ts`): clicking / Enter on a
  result row opens that result's zone, zooms to it and highlights the marker
  (and the row); clicking a marker selects and scrolls to its row. A selection
  is let go of by clicking its row again, the row's "Clear" button, Esc (on the
  map Esc clears first and only zooms out when nothing is selected) or a click
  on the map. **Letting go puts the view back:** a row selection snapshots the
  view (map id + zoom + pan) first — selecting another row keeps the ORIGINAL
  snapshot — and every clear path (incl. Reset filters) restores it: the
  `?m=` pushes the selection made are undone with browser Back (`back(n)`, so
  history is as it was) and the zoom/pan is re-applied once that map is on
  screen. **Manual-navigation rule:** any map change the selection didn't
  make (zoom out, breadcrumb, neighbour label, map click, "Open a map",
  "Your zone"/"Destination" buttons, browser Back, changing your zone) or any
  hand zoom/pan (wheel, pinch, a drag on a zoomed map, the +/− buttons, arrow
  / +/− keys, "Reset zoom") while selected
  drops the snapshot — the player took control, so letting go only clears the
  highlight in place. A marker click on the map never moves the view, so it
  takes no snapshot of its own. "Reset filters" (`hooks/useFindFilters.ts`)
  restores the finding filters + map layers and clears the selection — never
  the "You" section (faction/class/zone/level/position).
- **Route planner — works like a maps app** (`RoutePlanner`, `hooks/useTripPlanner.ts`,
  `worldMap/trip.ts`, search in `worldMap/search.ts`): search an NPC, town,
  zone or coordinates ("Find an NPC or place" — name, title, kind like
  "cooking trainer", area; any word order, accent-insensitive; Enter on an
  exact place name takes the place) → a destination card → **Directions**
  opens From/To fields (From defaults to "Your location"; also any NPC /
  place / coords, or "Choose on map"), with Swap and "Set as my location".
  Every result row's "Directions to X" button makes that row the destination.
  - The trip lives in the URL: `to=` / `from=` = `npc:<id>` | `place:<placeId>` |
    `pt:<zone>,<x>,<y>` (no `from` = your location), `dir=1` = directions
    open. Legacy `?npc=<creature id | result id>` = `to=npc:` (the Cooking &
    Fishing trainers link with it — a test checks every trainer's id, area
    and coords against `classicServices.json`).
  - **A trip never changes the saved location** — only "Set as my location"
    does; with directions open a map click does nothing (use "Choose on map").
  - Where a place routes to: a town → its middle; a city/district → its map
    centre; a zone → its flight master for your faction, else its largest
    town, else its centre — the card says which ("Westfall has no single
    spot, so I'm routing to …").
  - The map draws A (green, start) and B (red, destination) and each leg:
    walk solid, fly dashed, boat/zeppelin/tram dotted. It fits the smallest map
    that shows the whole route (`commonMap`: an end's own map when its
    picture holds every point, else the nearest common parent).
- **"Where are you?"** (`WhereAreYou`, `worldMap/places.ts` + `where.ts`) takes a
  place ("Goldshire", "Stormwind", "sw"), the minimap's district + coords
  ("Old Town 78.4, 53.2" → the city's map), bare coords (on the zone already
  picked, with a one-click "use the city map" when a city shares that ground)
  or `/way`. Places = zones + capitals (map tree), towns (subzone centroids of
  the NPC data) and capital districts / short names from the hand-written,
  names-only `data/worldMap/placeNames.ts`. A town puts you at its middle and
  says so. Buildings ("Deepwater Tavern") and named areas no NPC stands in
  ("Menethil Keep") come from `data/worldMap/areas.json` — the walk graphs'
  room / sub-zone labels, a spot on the place's floor (with `z`), written by
  `scripts/wow_world_map/areas.py` after the walk graphs (rebuild alone with
  `python -m scripts.wow_world_map.areas`). A name an NPC town already has
  stays the town. Coordinates are shown only in an opened row and on the last
  directions step.
- Placement: a nested capital wins, then the flight-path name's zone, then the
  zone whose painted overlay covers the point. Classic NPCs never land on a
  Forever-only zone (`FOREVER_ONLY_ZONES`); those zones say "Not mapped yet".
- **Layers:** NPC services (`classicServices.json`), quest givers
  (`classicQuests.json` — creature/gameobject questrelation + quest_template;
  side from RequiredRaces, class quests from RequiredClasses) and dungeon/raid
  entrances (`classicDungeons.json`). Entrances come from the Classic Era
  client's AreaTrigger (the Forever client ships no dungeon triggers) joined to
  cmangos `areatrigger_teleport`; levels are Forever's own, from LFGDungeons →
  ContentTuning `MinLevelSquish`. Forever-only dungeons have no positions yet.
- **Layers panel** (`MapLayersControl` → `MapLayersPanel` / `MapLayerGroup` /
  `MapLayerToggle`): a "Layers (N on)" button top-left inside the map box (a
  sibling of the viewer, so its Esc never zooms the map) opens a card on wide
  screens and a bottom sheet (≤ 55dvh, Done) below `sm`
  (`MOBILE_SHEET_QUERY`). Layers are `data/worldMap/mapLayerIds.ts` (ids are
  stored — never rename) and `layerCatalog.ts` (defs, groups, marker colours,
  defaults: flight masters, inns, your class's trainers, dungeons). Every
  layer is backed by data we have: service subkinds + profession tags
  (`classicServices.json`), quest givers with a quest you can take now
  (level + 2), dungeon/raid entrances, boat/zeppelin/tram stops
  (`travel.json`), and herb / ore sample spots (one per node type per zone,
  from the crafting `classic/sources.json` `objectSpots`, lazy-loaded the
  first time the panel opens or a gathering layer is on —
  `worldMap/loadGatheringMapSpots.ts`), and rares (every Classic spawn of the rares in
  `data/rares/`, lazy-loaded the same way — see Rares). Never add a layer without data.
  Counts are per viewed map (`worldMap/layerMarkers.ts`: `markersByLayer`,
  `layerCounts`; your faction + neutral only, dungeons for all); a zero
  count greys the toggle but keeps its choice. Layer markers show on every
  map level; your results still only on zone maps; a "Show all" search
  replaces them. Saved in `mga.wowForever.worldMap.layers.v1`
  (`hooks/useMapLayers.ts`, parsed by `worldMap/mapLayerSettings.ts`);
  "Reset filters" resets the layers but keeps the level tint switch.
- **Where to level** (in the panel, `LevelFitControl`): the player's saved
  level (the You section's `level`, shared both ways) tints each continent
  zone (`ZoneFitTints`, through the zone's highlight art) right / too low /
  too high (`worldMap/zoneFit.ts`: right = min − 2 ≤ L ≤ max). Colour plus
  symbol (✓ ↓ ↑) and words (`data/worldMap/levelFit.ts`, legend
  `LevelFitLegend`). Ranges are `zones.json` `levels` — the Forever client's
  AreaTable exploration levels, outliers trimmed — tagged "Game files"
  (`ZONE_LEVELS_PROVENANCE`). Zones with no range (cities, new in Forever)
  are never tinted.
- **Zone level labels** (`ZoneLevelLabels`, `worldMap/zoneLabels.ts`) on
  continent maps: name + "5–10" / "City" / "New in Forever", at each zone's
  deepest mask point; labels that would overlap at the picture's on-screen
  size are dropped, biggest zones first (zooming in brings more back). Tests:
  `wowWorldMapLayers.test.ts`, `e2e/wow-world-map-layers.spec.ts`; specs
  that click a zone's ground switch layers off first
  (`e2e/fixtures/mapLayers.ts`).
- **My marks, my route, Share this view** (P3; browser-only, no server):
  - **Map menu** (`useMapPressMenu`, `MapContextMenu`): right-click, a ~500 ms
    press with a finger (`LONG_PRESS_MS`; a ring fills from 150 ms; any drag
    > 6 px, a second finger or a page scroll cancels it; the browser's own
    long-press `contextmenu` is swallowed) or Shift+F10 / the menu key on the
    focused map (opens at the view's middle). Items: "Add a mark here",
    "Copy coordinates" (`x, y`, 0–100, one decimal) and "Zoom out to
    <parent>" (hidden at the root). Bottom sheet below `sm`. Also "Place a
    mark" (crosshair; Esc cancels) and "Add a mark at the map's centre" in
    the My marks panel for players who can't right-click or long-press.
  - **Marks** (`hooks/useMapMarks.ts`, pure CRUD in `worldMap/mapMarks.ts`):
    per map, localStorage `mga.wowForever.worldMap.marks.v1`, re-validated on
    read (`parseMapMarksStore`). Label (≤ 40 chars; any whitespace becomes
    one space and control / format characters are dropped by
    `lib/cleanUserText.ts`; rendered as text only) + a style from
    `data/worldMap/mapMarkStyles.ts` (style codes are in share links — never
    reuse one). Caps in `data/worldMap/mapMarks.ts`: 30 marks per map, 200 in
    all, 25 route stops. Delete / Clear route have Undo (until any other
    change or another map), never a confirm.
  - **Route** (`MapRouteList`, `worldMap/routeDistance.ts`): ordered stops of
    your own marks on one map, drawn as a numbered fuchsia line; reorder,
    remove, clear. Distances are **straight-line yards** (the directions'
    map ↔ world conversion, `mapToWorld` + `yardsBetween`) — no pathfinding,
    and the panel says so.
  - **Share link** (`worldMap/mapViewShare.ts`, `ShareViewButton`):
    `/wow-forever/map?m=<id>#view=1~<mapId>~<scale×100>.<cx×1000>.<cy×1000>~<layer codes ".">~<marks "_": x×10,y×10,styleCode,label>~<route indexes ".">`.
    Layer codes are `data/worldMap/mapLayerShareCodes.ts` (never reuse one).
    Labels percent-encoded incl. `~!'()*_`; one layer of an app's escaping is
    undone (`%7E` separators, or a whole-link encode — a marks field we wrote
    always has a ","). Decoding is strict (> 32000 chars — the biggest view we
    can make, encoded again, fits; a test checks it — wrong version,
    unknown map, bad numbers → null → "That shared map link doesn't work"
    notice); out-of-range values clamp, bad marks / route indexes drop.
    `hooks/useSharedMapView.ts` reads the fragment while rendering, puts the
    map in `?m=`, applies the zoom, PREVIEWS the layers (`useMapLayers`
    `preview` — never saved unless "Keep these layers") and strips the hash.
    The marks are a separate read-only set (dashed, `SharedViewBanner`) —
    "Save to my marks" ADDS them (duplicates skipped, a full map says how many
    didn't fit), never overwrites yours. The shared set lives in React state,
    so a reload drops it. Bump the version (and keep decoding v1) for any
    format change.
  - Tests: `wowWorldMapMarks.test.ts` (incl. hostile labels and links),
    `e2e/wow-world-map-marks.spec.ts`.
- Level rules (`worldMap/levels.ts`): trainers are never filtered by level;
  quests show when min level ≤ your level + 2; dungeons are coloured by the
  Classic con bands (grey/green/yellow/orange/red) and flagged "too low to
  enter" below the required level.
- Directions = travel-time search over walking, flight paths (fewest hops,
  then distance), boats/zeppelins and the Deeprun Tram (Stormwind ↔
  Ironforge — its stops are the Classic Era client's tram-entrance area
  triggers, see `travel.py`; the ride time is an estimate). "Flight paths:
  All / Only ones I know / None" (`FlightPathChoice`) limits which flight
  masters a route may use — a multi-hop flight only goes through ones you
  know, as in game; the choice and the ticked list live in
  `mga.wowForever.worldMap.travel.v1` (`hooks/useTravelSettings.ts`). Every
  flight step keeps the "flight paths must be discovered first" caveat.
- **Walks follow the ground** (`worldMap/walkGraph.ts`, `walkSteps.ts`,
  `hooks/useWalkGraphs.ts`): `public/wow-walk/<mapId>.walk` (gzipped, loaded
  only while directions are open for that continent) is a graph of walkable
  patches built from the Forever client's terrain, buildings and doodads
  (Recast navmesh), each labelled with its room / sub-area, indoor or not, and
  whether its zone is a capital city, plus lifts and same-map portals. It also
  holds the walk cost between every pair of travel
  hubs, so planning never searches once per hub. A walk leg is drawn as its
  real path and gets "Step by step" sub-steps ("Go into The Great Forge and
  head …", "Ride the lift up to …", "Step on the teleporter up …"); indoors
  and in capital cities they go turn by turn ("Turn left and head west,
  ~80 yd"). Hovering a step highlights its leg.
  - **Inside a cave or building** (`worldMap/insideRuns.ts`, `InsideSketch`):
    a stretch of a walk on indoor ground (≥ 40 yd or ≥ 2 lines; a capital
    city's buildings only when the walk ends in there) gets an open "Inside
    <name> · ~N yd, going down ~M yd" sketch in the walk step — the route over
    the indoor floor around it (`RouteSketch`, shared with dungeon interiors),
    shaded by height (lighter = higher), with numbered markers matching its
    lines; hovering / focusing / tapping a line picks out its stretch.
  - **Room labels** (`walk/floors.py`, `walk_graph.py`): a patch is in the
    WMO group whose walkable floor is right under it (never bounding boxes —
    they swallow the street outside). Indoor = the group's interior flag and
    its `WMOAreaTable` row NOT flagged `0x4` (open air). Don't use a roof
    test or the interior flag alone: Stormwind's streets are interior groups
    of the city WMO with arches and trees over them.
  Where the graph can't join two ends (or the file failed to load — the
  panel says so with Retry) the walk falls back to a straight line and the
  footnote says so. NPCs, quest givers and dungeon entrances carry a `z`
  column so an end snaps to the right floor.
  - **Generated** by `python -m scripts.wow_world_map.walk <mapId> ...`
    (also run by `scripts.wow_world_map.build` unless `--no-walk`; needs
    `npm install` for `recast-navigation` and the dev-group numpy). Stages
    cache per client build under the download cache. Travel hubs snap to
    the largest ground in reach; a boat / zeppelin stop snaps to the highest
    non-water ground within 40 yd and not above the vehicle (the pier, the
    tower top) — a hub the log calls "off the walk graph" walks straight.
    Layout in `walk/export.py`; `tests/test_wow_walk_graph.py`.
  - **Dungeon interiors** ("Inside · bosses & routes" on an entrance row,
    `InstanceInterior` / `InteriorBossRoute` / `RouteSketch`,
    `worldMap/interiors.ts`, `hooks/useInteriors.ts`): each instance map has
    its own `public/wow-walk/<instance map id>.walk` (meta `instance: 1`;
    hubs `e<trigger>` = where an entrance puts you, `b<encounter>` = a boss),
    built from `classicInteriors.json` (`scripts/wow_world_map/interiors.py`:
    Forever `DungeonEncounter` rows with DifficultyID 0 **and** 1 together, in
    OrderIndex order — the client splits one dungeon across both (Gnomeregan's
    Grubbis, Blackfathom's last three bosses are 1); 198/201/215 are other
    modes, left out — + cmangos spawns matched by name;
    group encounters use a stand-in creature, `_STAND_INS`). A boss is listed
    under the entrance it's the shortest walk from (Dire Maul / Scarlet
    Monastery wings never route into each other); routes start from the boss
    before (default) or the entrance (`mga.wowForever.worldMap.interior.v1`).
    Bosses with no fixed spawn say so, never a guessed spot; doors needing a
    key are flagged on the step that passes them (doors aren't in the
    navmesh). A WMO-only map's building is placed by its WDT with **no
    map-origin offset** (`terrain.global_wmo`); dungeon anchors snap to the
    nearest floor (`clusters.snap_inside`), never "the largest ground", which
    outside a castle is the zone's terrain. Dungeons use a finer navmesh
    (`navmesh.mjs --fine`, ~0.35 yd cells, the player's 0.3 yd radius) so
    narrow spiral stairs survive (Shadowfang's tower); finer still splits
    Blackrock Depths. Two **one-way** edge kinds exist only in dungeon files
    (kind ≥ 3 goes a → b only, in `export._adjacency` and `decodeWalkGraph`):
    `teleport` (an unpaired same-map area trigger — Naxxramas' Frostwyrm
    Lair) and `drop` (`walk/drops.py`: off an open navmesh edge down 2–20 yd
    onto floor past it — Wailing Caverns' gap to Serpentis, Grobbulus → Gluth).
    A drop is added only on the way to a boss's floor nothing else reaches,
    never as a shortcut. Rebuild with
    `python -m scripts.wow_world_map.walk --interiors [mapId ...]`.
- **Companion addon** `apps/mygamingassistant/addons/MGACompanion` (Interface
  16001): `/mga way <uiMapID|zone name> <x> <y> [label]` sets the in-game map
  pin. The page's "Copy in-game waypoint" buttons emit that command.
- **Captured locations (Forever ground truth):** the addon's `Capture.lua`
  records — out of combat only, never hostile units — titled NPCs you target or
  mouse over within interact range (plus what they offer: trainer, flight
  master, bank, auction house, stable, repair), quest givers you talk to (with
  their quests) and dungeon entrances you walk through, into SavedVariables
  `MGACompanionDB` (`/mga captures` shows the count). The operator imports
  `WTF\Account\<account>\SavedVariables\MGACompanion.lua` on the map page
  (signed in, full-auth mode only): it is parsed in the browser
  (`worldMap/capture/` — a data-only Lua table reader, never `eval`),
  classified into the map's service subkinds, then `POST /api/wow/map-captures`
  upserts by `capture_key` (newer `captured_at` wins). `GET` is public in both
  modes; the page merges captures over Classic rows (`applyCaptures.ts`): same
  npc id / instance id, else same name + zone; matched rows keep their Classic
  id, subkind and levels and show a "Seen in game <date>" badge. If the GET
  fails the page says so and shows Classic only — never localStorage.
- **Publishing captures to prod (serve-only, no import route):** locally run
  `python -m app.cli export-wow-captures` → commit
  `backend/data/wow_map_captures.json` → the deploy's `post_deploy_commands`
  run `import-wow-captures`, which mirrors the pack (a full snapshot: captures
  absent from it are deleted; an empty pack deletes nothing).

## Fixture Loading

Fixture JSON files live in `app/fixtures/`. Load them via CLI:

```bash
python -m app.cli load-fixtures
```

This is idempotent — re-running is safe (upserts by slug).

## Commands

**Backend** (from `apps/mygamingassistant/backend/`):
```bash
source .venv/bin/activate
uvicorn app.main:app --reload --reload-dir app --port 8004
python -m app.workers.scheduler_worker   # the scheduled jobs (the API never runs them)
alembic upgrade head
alembic revision -m "description"
pytest

# Load fixture data
python -m app.cli load-fixtures
```

**Backend dependency management**:
```bash
uv sync                                                # first-time setup
uv add <pkg>                                           # add dep
uv export --format requirements-txt --no-hashes \
  --no-emit-project --output-file requirements.txt    # regenerate after dep changes
git add pyproject.toml uv.lock requirements.txt
```

**Frontend** (from `apps/mygamingassistant/frontend/`):
```bash
npm run dev       # Dev server on :5176 — requires backend on :8004
npm run build     # TypeScript check + Vite build
npm run typecheck
npm run lint
npm test
```

## Architecture Rules

**No register route.** `fastapi_users.get_register_router()` is never mounted.

**Seed user.** `_on_startup()` calls `seed_operator_user()` which checks for
`SEED_USER_EMAIL` + `SEED_USER_PASSWORD_HASH` in production and creates the user if
missing. If either env var is absent in production, the app refuses to start.

**Layered:**
- Routes → Services → Repositories; never import ORM/DB in route handlers
- One model per file, one schema per file

**Enums:**
- All enums are `String(N)` + `CheckConstraint("col IN (...)")` — never SQLAlchemy Enum type
- Table names are singular (`game`, `map`, `user` — matches MBK convention)

**Timestamps:**
- `DateTime(timezone=True)` on every datetime column
- `created_at` + `updated_at` with both Python and server defaults

**UUIDs:**
- `uuid.uuid4()` Python default — never `uuid-ossp` Postgres extension

## Authentication Model

MGA uses **public-read / auth-write** routing. The lineup library is publicly
browsable; mutations require operator login. This is an MGA-specific Tier 3
divergence from MBK / MJH (which remain fully auth-gated — they handle personal
financial / job-hunt data). Rationale: single-user content curation works better
as a public knowledge base — read-many, write-one.

### Backend route split

Each `app/api/*.py` module that has both reads and writes exports two routers:

```python
# Public — no auth dependency
public_router = APIRouter(prefix="/api", tags=["..."])

# Operator-only — Depends(current_active_user) at router level (NOT per-handler)
auth_router = APIRouter(
    prefix="/api",
    tags=["..."],
    dependencies=[Depends(current_active_user)],
)
```

Modules that are purely public (e.g., `games.py`) export a single `router`.
Modules that are purely operator-gated (e.g., `sources.py`, `scheduler.py`)
export a single `router` with the auth dependency at the router level.

`main.py` mounts both routers from split modules:

```python
app.include_router(lineups.public_router)
app.include_router(lineups.auth_router)
```

**Why router-level dependencies, not per-handler:** adding new auth-required
handlers cannot accidentally regress to "no auth" — the gating is declared
once on the router. This is the no-bandaid approach (see
`rules/no-bandaid-solutions.md`).

### Endpoint inventory

| Surface | Public | Auth |
|---|---|---|
| `/api/games/*` | All | — |
| `/api/lineups` (list/detail/zone-density) | GET on accepted only | non-accepted via `/api/lineups/{id}/admin` |
| `/api/lineups/*` mutations | — | All (upload-url, POST, PATCH, DELETE, classify, accept, hide, bulk-accept, pending) |
| `/api/lineup-packages` | GET + `/pin` (no server state) | POST / PATCH / DELETE |
| `/api/sources/*` | — | All |
| `/api/wow/items/extract` | POST, both modes (Claude reads an item screenshot/text; Turnstile + per-IP limit + durable daily cap; 503 `item_reader_unavailable` when unconfigured) | — |
| `/api/wow/feature-requests` | GET board + `/{id}` (public stories only), POST submit (Turnstile + per-IP + inbox guard + daily cap; 503 `feature_requests_unavailable` when unconfigured), POST/DELETE `/{id}/vote` — both modes | — |
| `/api/wow/chat/turn` | POST, both modes (the "Ask" chat relay: 64 KB body cap, signed ticket, per-IP limits, Turnstile on new messages, durable token budgets; 503 `chat_unavailable` when unconfigured) | — |
| `/api/wow/feature-requests/triage/*` | — | Superuser (`current_superuser`), BOTH modes. The one operator write surface in serve-only prod |
| `/api/wow/map-captures` | GET, both modes (World Map locations captured in Forever) | POST import (full-auth only; prod gets captures via the committed pack) |
| `/api/wow/prices` | GET, both modes (one US auction house's prices from Blizzard, `?server=pvp&faction=alliance\|horde\|neutral`, default PvP · Alliance; only mapped servers; refreshed by the scheduler; per-house ETag + 10-min cache) | — |
| `/api/wow/characters/{slug}`, `/api/wow/characters/{slug}/render.png` | GET, both modes (a Forever character's profile + gear, and their cropped render, from Blizzard by name; per-IP limit, 5-min cache) | — |
| `/api/wow/server-status`, `/api/wow/server-status/history` | GET, both modes (live status from Blizzard, 60-s cache; 7 days of recorded status per ruleset) | — |
| `/api/wow/icons/{build}/{fdid}.webp` | GET, both modes (in-game icons streamed from object storage; year-long immutable cache, 404 + no-store when unpublished) | — |
| `/api/wow/satellite/{build}/{uiMapId}.webp` | GET, both modes (World Map satellite pictures, same service and cache rules as icons) | — |
| `/api/scheduler/*` | — | All |
| `/admin/*` | — | All |
| `/users/me*` | — | All (serve-only: `GET /users/me` only) |
| `/auth/*` login/forgot/reset/verify | Yes (serve-only: `/auth/jwt/login` + `/auth/totp/login` only) | — |
| `/auth/jwt/logout`, TOTP setup/verify/disable/status | — | Yes (both modes) |
| `/_test/*` (when `MGA_ENABLE_TEST_HELPERS=1`) | — | `reset-rate-limit`, `seed-lineup` etc. |
| `/health`, `/version` | Yes | — |

**Serve-only exception:** players never sign in to serve-only prod, but the
operator does — `_mount_serve_only_operator_routes` in `app/main.py` mounts a
minimal operator surface: JWT + TOTP login (same per-IP throttle, lockout and
TOTP challenge as full mode, via the shared `_mount_operator_login_routes`),
logout, `GET /users/me` and the TOTP management routes. No register,
forgot/reset/verify, or lineup/source write routers. Login needs no Turnstile
(full mode only puts it on forgot-password). The only operator API on top is
triage. In the serve-only frontend `/login` is reachable but linked from
nowhere; signed in, the guest shell stays and adds only Triage, Two-factor
(`/security`, 2FA only) and Sign out (`ServeOnlyOperatorActions`). Don't add
write routers to serve-only; use full-auth mode.

The public `GET /api/lineups/{id}` returns 404 on `pending_review` or `hidden`
lineups so their presigned screenshot URLs don't leak before the operator
accepts them. The operator can still inspect any lineup via the auth-only
`/api/lineups/{id}/admin`.

### Frontend gating

The SPA loads for everyone — no global login redirect. Two gates:

- **`<AuthRequired action="...">`** wraps write-surface routes in `routes.tsx`.
  When unauthenticated, renders a centered card explaining what auth unlocks
  + a "Sign in" button that routes to `/login` carrying the current pathname
  so Login can return the user here on success.
- **`<RootLayout>`** swaps between `AppShell` (authenticated) and `GuestShell`
  (unauthenticated). The guest shell shows a "Sign in" CTA in place of the
  user dropdown and a filtered nav (only `PUBLIC_NAV_PATHS` from
  `constants/nav.ts`).

When changing the auth status of an endpoint, also update the frontend route
wrapping and the nav inclusion list — keep the backend and frontend gates
aligned so users don't see "Sign in" prompts for pages that are actually
public, or empty pages where they expected to see content.

## Deployment

**VPS path:** `/srv/myfreeapps/apps/mygamingassistant`

**Required env files (must exist on VPS before first deploy):**

| File | What it is |
|---|---|
| `apps/mygamingassistant/.env` | Compose-level — only `DB_PASSWORD` |
| `apps/mygamingassistant/backend/.env.docker` | App-level — all other secrets; see `backend/.env.docker.example` |

**Critical env vars:**

| Var | Required | Notes |
|---|---|---|
| `SEED_USER_EMAIL` | Yes (prod, both modes — serve-only too, for triage sign-in) | Operator login email |
| `SEED_USER_PASSWORD_HASH` | Yes (prod) | bcrypt hash — generate with `python -c "import bcrypt, getpass; print(bcrypt.hashpw(getpass.getpass().encode(), bcrypt.gensalt()).decode())"` (prompts for the password) |
| `SECRET_KEY` | Yes | JWT signing key — generate with `openssl rand -hex 32` |
| `ENCRYPTION_KEY` | Yes | Fernet key for PII — generate with `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"` |
| `DATABASE_URL` | Yes | Full async postgres URL |
| `TURNSTILE_SECRET_KEY` | Optional | Forgot-password (full-auth) + the public WoW item reader + feature-request submit. In serve-only/production both answer 503 without it (no boot guard) |
| `TURNSTILE_SITE_KEY` | Optional | Public site key. The prod bundle gets it from the GitHub Actions variable `MYGAMINGASSISTANT_VITE_TURNSTILE_SITE_KEY` (registry build), not from `.env.docker` |
| `ANTHROPIC_API_KEY` | Optional | Classifier + WoW item reader + feature requests. Missing → both answer 503 (no boot guard) |
| `CLAUDE_ITEM_EXTRACTOR_MODEL` | Optional | Defaults to `claude-haiku-4-5-20251001` |
| `WOW_EXTRACT_DAILY_CAP` | Optional | Global item-reader Claude calls per UTC day (DB-backed). Default 300; `0` switches the reader off |
| `ITEM_EXTRACT_RATE_LIMIT_THRESHOLD` / `_WINDOW_SECONDS` | Optional | Per-IP item-reader limit. Default 20 per 3600 s |
| `WOW_FEATURE_REQUEST_DAILY_CAP` | Optional | Global feature-request Claude calls per UTC day. Default 100; `0` switches submitting off (board + votes still work) |
| `CLAUDE_FEATURE_REFINER_MODEL` | Optional | Defaults to `claude-haiku-5-5` |
| `WOW_FEATURE_SUBMIT_RATE_LIMIT_PER_HOUR` / `_PER_DAY`, `WOW_FEATURE_VOTE_RATE_LIMIT_PER_HOUR` | Optional | Per-IP limits. Defaults 5 / 20 / 60 |
| `CLAUDE_WOW_CHAT_MODEL` | Optional | "Ask" chat model. Defaults to `claude-haiku-5-5` |
| `WOW_CHAT_MAX_TOKENS` | Optional | Output cap per chat reply. Default 800 |
| `WOW_CHAT_DAILY_TOKEN_CAP` / `WOW_CHAT_IP_DAILY_TOKEN_CAP` | Optional | Weighted tokens per UTC day, global / per network (DB-backed). Defaults 2,500,000 / 250,000; `0` switches the chat off |
| `WOW_CHAT_TURN_RATE_LIMIT_PER_HOUR` / `_PER_DAY`, `WOW_CHAT_CONTINUATION_RATE_LIMIT_PER_HOUR` | Optional | Per-IP limits. Defaults 20 / 60 / 60 |
| `WOW_PRICE_REFRESH_ENABLED` | Optional | Default `true`. Refreshes the auction-house prices from Blizzard every `WOW_PRICE_REFRESH_INTERVAL_HOURS` (default 3) and at boot — also in serve-only prod, whatever `SCHEDULER_ENABLED` says. `false` stops refreshing; `GET /api/wow/prices` keeps serving what's stored |
| `BLIZZARD_CLIENT_ID` / `BLIZZARD_CLIENT_SECRET` | Yes (prod, when `WOW_PRICE_REFRESH_ENABLED=true`) | Blizzard Game Data API client (develop.battle.net → API Access). The `scheduler` container refuses to boot without them while the price refresh is on. Secrets — never log or paste them |
| `WOW_SERVER_STATUS_RECORDING_ENABLED` | Optional | Default `true`. Records realm status every 5 min for the server status page's history (also in serve-only prod). `false` stops recording; the page keeps showing what's stored |

**Scheduler:** APScheduler runs ONLY in the one-replica `scheduler` compose service
(`python -m app.workers.scheduler_worker`). The API runs `uvicorn --workers 2` and never
starts one — a scheduler per worker ran every job twice. The worker writes each job's
next run to `scheduler_job` every 15 s (`GET /api/scheduler/status` reads it; a report
older than 45 s means "not running") and starts runs the API asked for
(`POST /api/scheduler/trigger/{job_id}` sets `run_requested_at`). A restart resumes each
job's cadence from that table, so frequent deploys never postpone the daily purges.
Healthcheck: `python -m app.workers.scheduler_healthcheck` (heartbeat file age); the
deploy waits for it. Three failed ticks in a row exit the process and Docker restarts it.

**After first deploy:**
```bash
# On VPS, seed fixtures
docker compose -f apps/mygamingassistant/docker-compose.yml exec api \
  python -m app.cli load-fixtures
```

**Routing:**
- Domain: `mygamingassistant.myfreeapps.org`
- Host Caddy proxies to docker Caddy on `127.0.0.1:8096`
- Docker Caddy owns `/api/*` → backend proxy, SPA fallback, security headers

**Health check:**
```bash
curl http://127.0.0.1:8096/health
```

## Phase Plan

- **Phase 1 (current):** Scaffold — auth, domain models, fixture data, stub API routes, frontend stubs
- **Phase 2:** Full lineup CRUD — upload screenshots, position sources on minimap, annotate
- **Phase 3:** Lineup viewer — overlay on minimap canvas, filter by utility/site/zone
- **Phase 4:** Packages — group lineups into named sets, share/export
- **Phase 5:** AI suggestions — generate lineup descriptions with Claude
- **Phase 6:** Multi-game analytics — compare lineup coverage across maps
- **Phase 7:** Desktop shell — Tauri wrapper for native-app feel

## Discord Bot

MGA uses an **HTTP-interactions** model — no gateway, no persistent WebSocket. Discord
POSTs signed requests to `https://mygamingassistant.myfreeapps.org/api/discord/interactions`
(Caddy strips `/api`, FastAPI handles `/discord/interactions`).

### Activation

1. Create a Discord application at https://discord.com/developers/applications
2. Set in `backend/.env.docker`:
   ```
   DISCORD_ENABLED=true
   DISCORD_APPLICATION_ID=<General Information → Application ID>
   DISCORD_PUBLIC_KEY=<General Information → Public Key>
   DISCORD_BOT_TOKEN=<Bot → Reset Token>
   DISCORD_DEV_GUILD_ID=<optional, your dev server ID for instant command propagation>
   ```
3. Register slash commands (run from inside the container or with the venv active):
   ```bash
   # Register globally (~1h propagation):
   python -m app.cli discord-register-commands

   # Register to a specific guild (instant):
   python -m app.cli discord-register-commands --guild 1234567890
   ```
4. **After deploy**, set the Interactions Endpoint URL in the Developer Portal:
   ```
   https://mygamingassistant.myfreeapps.org/api/discord/interactions
   ```
   Discord sends a PING when you save; the endpoint must return `{"type":1}`.

### Local testing with cloudflared

Discord requires a public HTTPS URL for the Interactions Endpoint. Use `cloudflared`
to expose the local backend:

```bash
# In one terminal — start the backend
uvicorn app.main:app --reload --port 8004

# In another terminal — create a tunnel
cloudflared tunnel --url http://localhost:8004
# Cloudflared prints: https://<random>.trycloudflare.com

# Construct the interactions URL (backend path, no /api prefix needed with tunnel):
# https://<random>.trycloudflare.com/discord/interactions
```

Set the Interactions Endpoint URL to `https://<random>.trycloudflare.com/discord/interactions`
in the Developer Portal **→ General Information** and click **Save Changes**. Discord
will send a PING — if the backend returns `{"type":1}` the URL is accepted.

Note: the tunnel URL changes every session. You must re-register it in the Portal
each time. **Do not use this URL in production** — set the production URL after deploy.

### Architecture

| Layer | File |
|---|---|
| Route (Ed25519 verification, dispatch) | `app/api/discord_interactions.py` |
| Dispatcher (command/component registry) | `app/services/discord/dispatcher.py` |
| Command handlers | `app/services/discord/commands/*.py` |
| Command definitions (API payload shape) | `app/services/discord/commands_spec.py` |
| Shared primitives (platform_shared) | `packages/shared-backend/platform_shared/services/discord/` |

### Adding a new slash command

1. Add a handler in `app/services/discord/commands/<name>.py`
2. Register it in `app/services/discord/dispatcher._COMMAND_HANDLERS`
3. Add the definition in `app/services/discord/commands_spec.ALL_COMMANDS`
4. Re-run `python -m app.cli discord-register-commands`

`discord-register-commands` bulk-overwrites the global commands but **keeps the
`PRIMARY_ENTRY_POINT` command** that Discord creates when Activities are enabled
(`overwrite_global_commands_preserving_entry_point` in
`platform_shared/services/discord/commands.py`). Never drop that preservation:
Discord rejects a bulk overwrite that removes the Entry Point command, so every
deploy's post-deploy command would fail.

## Discord Activity

The same Discord application also runs MGA as an **Activity**. From the App
Launcher (voice or text channel), Discord iframes the SPA at
`https://1555249458542022666.discordsays.com`, its proxy for
`mygamingassistant.myfreeapps.org`. v1 is **read-only public content** with no
Discord sign-in, which would need the client secret plus a token exchange.

| Piece | Where |
|---|---|
| Framing: SPA `frame-ancestors` admits Discord, API keeps XFO DENY | `app.yaml` `discord_activity: true` → `infra/templates/Caddyfile.docker.j2` + `platform_shared/infra/render.py` |
| SDK client id (`GET /api/discord/activity-config`) | `platform_shared/api/discord_activity_router.py`, mounted in `app/main.py` only when `DISCORD_ENABLED` + `DISCORD_APPLICATION_ID` are set |
| Detection, SDK bootstrap, connect/error screens, `openExternal`, `OutboundLink`, API URL remap | `@platform/ui/discord-activity` |
| Activity bar (Games / theme / Open in browser); the landing is the game picker | `src/components/discord/DiscordActivityShell.tsx`, `src/RootLayout.tsx` |
| Read-only switch (serve-only build OR Activity) | `src/lib/readOnly.ts` |
| URL Mappings, as data | `src/constants/discordActivity.ts` |

`@platform/ui/discord-activity` is a subpath import only. Re-exporting it from the
package index would bundle the SDK into every app.

The app knows it is inside the Activity from Discord's `frame_id` launch parameter,
which is kept in sessionStorage across reloads. Inside the Activity:

- Sign-in, account and write routes are unavailable.
- Add lineup and World Map import are hidden.
- The WoW screenshot reader is browser-only, because Turnstile can't load through
  Discord's proxy.

**Open in browser** covers the rest: Discord's `openExternalLink` opens the same
page on the real site.

### Rules when changing the frontend

- **New external origin**, i.e. a host added to `csp` in `app.yaml`: add it to
  `MGA_DISCORD_URL_MAPPINGS` **and** the Developer Portal, or list it as
  deliberately unmapped. `discordActivityMappings.test.ts` fails otherwise.
- **Outbound links:** use `OutboundLink` / `openExternal`, never a bare
  `target="_blank"`. Discord's sandbox blocks new tabs.
- **New write surface or auth-only route:** gate it on `isReadOnly()`, not
  `isServeOnly()`.
- **Load errors:** offer a retry (`LoadErrorRetry`), not "please refresh". Discord
  has no refresh button.

### Developer Portal (Activities)

Enable Activities only **after** the Entry-Point-preserving
`discord-register-commands` is deployed.

1. **Activities → Settings:**
   - Enable Activities. This auto-creates the "Launch" Entry Point command.
   - Supported Platforms: Web, iOS, Android.
   - Default orientation lock, phone and tablet: unlocked.
   - Not age-restricted.
2. **Activities → URL Mappings**, in this order. The root `/` goes LAST, because
   shorter shared prefixes must come after longer ones:

   | Prefix | Target |
   |---|---|
   | `/r2/{subdomain}` | `{subdomain}.r2.cloudflarestorage.com` |
   | `/mga-clips` | `mga-clips.myfreeapps.org` |
   | `/` | `mygamingassistant.myfreeapps.org` |

3. **Try it:**
   - Turn on Developer Mode (User Settings → App Settings → Advanced).
   - In the operator's server, launch MyGamingAssistant from the App Launcher, or
     from the rocket button in a voice call.

`e2e/discord-activity.spec.ts` covers the in-Discord flow without Discord. It uses
a same-origin host page that plays Discord's client.

## Tech Debt Policy

mode: no-growth on flagged files

A PR MAY NOT increase the LOC count of any file currently listed under
`scripts/file-size-allowlist.yml` `over_1000_loc` OR any source file already
over 500 LOC. If a PR genuinely needs to add to a flagged file, the same PR
MUST split that file (extract a sibling module + re-export from the original)
in the same commit. The CI check at `.github/workflows/file-size-check.yml`
enforces this.

Critical severity items that directly block the current feature can still be
fixed inline. Everything else logged in `TECH_DEBT.md` and addressed in
dedicated refactor PRs.
