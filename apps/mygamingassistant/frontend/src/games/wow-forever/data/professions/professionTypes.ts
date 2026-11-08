import type { RankName, RankProfession } from "@/games/wow-forever/data/professions/rankTrainerTypes";
import type { ConfidenceBasis } from "@/games/wow-forever/types/confidenceBasis";
import { GATHERING_PROFESSION } from "@/games/wow-forever/types/gathering/gatheringProfession";
import { SECONDARY_PROFESSION, type SecondaryProfession } from "@/games/wow-forever/types/secondaryProfession";
import type { PlayerFaction } from "@/games/wow-forever/types/worldMap";

/** Professions with hand-written guides: the secondary ones and the gathering ones (crafting ones are `CRAFTING_PROFESSION`). */
export const PROFESSION = { ...SECONDARY_PROFESSION, ...GATHERING_PROFESSION } as const;
export type Profession = (typeof PROFESSION)[keyof typeof PROFESSION];

/**
 * "confirmed" = seen in Forever (beta or launch client, Blizzard, or in game).
 * "unconfirmed" = Classic Era fact or community claim not yet checked in Forever.
 */
export type Confidence = "confirmed" | "unconfirmed";

/** Same text for both factions, or one per faction. */
export type FactionText = string | Readonly<Record<PlayerFaction, string>>;

/** A material the route needs, by item id, so it can open to where to get it. */
export interface MatRef {
  id: number;
  name: string;
}

export interface CraftStep {
  kind: "craft";
  skill: string;
  name: string;
  materials: FactionText;
  /** Every item named in `materials`, in the same order. */
  mats?: readonly MatRef[];
  /** The foods (by food id) whose recipe the row has you buy — each gets a "Buy from" line. */
  recipes?: readonly MatRef[];
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
  /** Trainers who teach this rank (from the Classic trainer data), listed under the step. */
  teaches?: { profession: RankProfession; rank: RankName };
  /** The NPC who sells the book or gives the quest, for the faction (one NPC = both factions). */
  npc?: TrainerNpc | Readonly<Record<PlayerFaction, TrainerNpc>>;
  confidence: Confidence;
  /** The milestone is buying the rank's book (Expert Cookbook) — it gets a "Buy from" line. */
  buysBook?: true;
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

/** A trainer as the World Map knows them — `npcId` opens `/wow-forever/map?npc=<id>`. */
export interface TrainerNpc {
  name: string;
  npcId: number;
  /** "Stormwind City" / "Goldshire, Elwynn Forest" — the World Map's area label. */
  where: string;
  /** Classic map coordinates on that map. */
  x: number;
  y: number;
}

/** A capital city's trainer for each secondary profession. */
export type CityTrainers = { city: string; faction: PlayerFaction } & Readonly<Record<SecondaryProfession, TrainerNpc>>;

/** One faction's town trainers, per secondary profession. */
export type TownTrainers = Readonly<Record<SecondaryProfession, readonly TrainerNpc[]>>;

export interface FishRecipe {
  skill: number;
  fish: string;
}

export interface ForeverChange {
  text: string;
  confidence: Confidence;
  /** Why an unconfirmed change is listed — picks its badge (`confidenceProvenance`). No basis = Unconfirmed. */
  basis?: ConfidenceBasis;
}
