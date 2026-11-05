import type { Confidence } from "@/games/wow-forever/data/professions/professionTypes";

/** How a specialization is learned, as the page tells it (Classic). */
export type SpecHowTo =
  /** The generated Classic quests for it (`CraftingFile.specs[].quests`), with their givers. */
  | { kind: "quests" }
  /** No Classic quest teaches it in the data: what Classic did, and where. */
  | { kind: "note"; text: string; spot: { label: string; zoneId: number; x: number; y: number } | null };

export interface CraftingSpecChoice {
  /** The `?spec=` value. */
  id: string;
  /** The specialization spell — the generated recipes' `spec`. */
  spell: number;
  label: string;
  /** What it's for, in one line. */
  summary: string;
  /** The choice you need first (a master specialization needs Weaponsmith). */
  requires?: string;
  howTo: SpecHowTo;
}

/** A profession's specializations: where the route forks, and the choices. */
export interface CraftingSpecs {
  /** Skill where you can pick one (Classic). */
  forkAt: number;
  /** Character level the Classic quests ask. */
  level: number;
  intro: string;
  choices: readonly CraftingSpecChoice[];
  /** Why to choose once — worded as Classic, no prices. */
  unlearnWarning: string;
  confidence: Confidence;
}
