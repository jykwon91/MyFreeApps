/**
 * Everything under `data/professions/` was researched against the Forever beta
 * (Blizzard beta forums, the operator's in-game screenshots) and re-checked on
 * 2026-11-05 against the launch client (1.60.1.70790, wago.tools branch `wowf`)
 * and Blizzard's posts. Rows still marked `confidence: "unconfirmed"` depend on
 * server-side facts (trainers, vendors, quests, fishing zones) that neither the
 * client nor a Blizzard post settles yet — check them in game, then update this.
 */
export const PROFESSIONS_DATA_STATUS = {
  stage: "Live game — some rows still unconfirmed",
  checkedOn: "2026-11-05",
} as const;
