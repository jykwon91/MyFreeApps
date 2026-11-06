/** `data/gear/gearFacts.json` (Forever client), keyed by item id. */
export interface GearFactsFile {
  clientBuild: string;
  eraLeftovers: readonly number[];
  deprecated: readonly number[];
  /** [profession, skill] */
  crafted: Readonly<Record<string, readonly [string, number]>>;
  /** [skill, rank] */
  requires: Readonly<Record<string, readonly [string, number]>>;
  /** [faction, rank] */
  reputation: Readonly<Record<string, readonly [string, string]>>;
  pvp: Readonly<Record<string, number>>;
  bindOnPickup: Readonly<Record<string, number>>;
}
