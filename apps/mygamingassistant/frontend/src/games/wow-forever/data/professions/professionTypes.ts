import type { PlayerFaction } from "@/games/wow-forever/types/worldMap";

export const PROFESSION = { cooking: "cooking", fishing: "fishing" } as const;
export type Profession = (typeof PROFESSION)[keyof typeof PROFESSION];

/**
 * "confirmed" = seen in Forever (beta client, Blizzard, or in game).
 * "unconfirmed" = Classic Era fact or community claim not yet checked in Forever.
 */
export type Confidence = "confirmed" | "unconfirmed";

/** Same text for both factions, or one per faction. */
export type FactionText = string | Readonly<Record<PlayerFaction, string>>;

export interface CraftStep {
  kind: "craft";
  skill: string;
  name: string;
  materials: FactionText;
  source: FactionText;
  note?: string;
  confidence: Confidence;
}

/** A skill cap you must raise (new rank, book or quest) before the route continues. */
export interface MilestoneStep {
  kind: "milestone";
  skill: string;
  name: string;
  detail: FactionText;
  confidence: Confidence;
}

export type RouteStep = CraftStep | MilestoneStep;

export interface HowToStep {
  id: string;
  title: string;
  detail: string;
  /** "Stuck?" help shown right under the step where people get stuck. */
  stuck?: string;
  /** A chat command worth copying, e.g. `/cast Cooking`. */
  command?: string;
  /** Something that costs you in game if you forget it. */
  warning?: string;
}

export interface TrainerNpc {
  name: string;
  /** Classic map coordinates, e.g. "78, 53". */
  coords: string;
}

export interface CityTrainers {
  city: string;
  faction: PlayerFaction;
  cooking: TrainerNpc;
  fishing: TrainerNpc;
}

export interface TownTrainers {
  cooking: readonly string[];
  fishing: readonly string[];
}

export interface FishRecipe {
  skill: number;
  fish: string;
}

export interface ForeverChange {
  text: string;
  confidence: Confidence;
}
