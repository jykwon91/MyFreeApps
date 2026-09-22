import type { WowClassId } from "@/games/wow-forever/data/classes";

export type Faction = "alliance" | "horde";

export interface ClassPick {
  classId: WowClassId;
  roles: string;
  summary: string;
  /** Set only for the classes we recommend to first-timers, with the reason. */
  beginnerReason: string | null;
}

export interface ChecklistItem {
  id: string;
  title: string;
  detail: string;
}

export interface ZoneBand {
  levels: string;
  zones: readonly string[];
}

export interface BetaZone {
  name: string;
  detail: string;
}

export interface ProfessionPair {
  pair: string;
  goodFor: string;
  why: string;
}

export interface AddonPick {
  name: string;
  what: string;
}

export interface DungeonTopic {
  title: string;
  points: readonly string[];
}
