/** The saved character's completed quests, for the dungeon checklists. */
export type BattleNetQuestsState =
  | { kind: "none" }
  | { kind: "loading" }
  | { kind: "error"; retry: () => void; retrying: boolean }
  | { kind: "not-found"; characterName: string }
  | { kind: "ready"; characterName: string; ids: ReadonlySet<number> };
