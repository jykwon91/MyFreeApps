/** `data/gear/classic/gearSources.json` (cmangos Classic), keyed by item id / dungeon map id. */
export interface GearSourcesFile {
  /** [name, Forever level, level to enter] */
  dungeons: Readonly<Record<string, readonly [string, number, number]>>;
  raidOnly: readonly number[];
  /** Gear Classic gated behind a PvP rank or a battleground reputation. */
  pvp: readonly number[];
  /** [title, min level, quest level, side, classes] */
  quests: Readonly<Record<string, readonly (readonly [string, number, number, string, string])[]>>;
  /** [boss, dungeon map id] */
  drops: Readonly<Record<string, readonly (readonly [string, number])[]>>;
}
