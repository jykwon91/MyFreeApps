import type { WowClassId } from "@/games/wow-forever/data/classes";

/**
 * How sure a gold tip is for Forever:
 * - `classic`: true in Classic Era, nothing published says Forever changed it (no chip).
 * - `forever`: published by Blizzard for Forever.
 * - `unknown`: depends on something Forever hasn't published yet.
 */
export const GOLD_CONFIDENCE = { classic: "classic", forever: "forever", unknown: "unknown" } as const;
export type GoldConfidence = (typeof GOLD_CONFIDENCE)[keyof typeof GOLD_CONFIDENCE];

export interface GoldTip {
  id: string;
  title: string;
  detail: string;
  confidence: GoldConfidence;
}

export const LEVEL_BAND = { early: "1-20", mid: "20-40", late: "40-60" } as const;
export type LevelBand = (typeof LEVEL_BAND)[keyof typeof LEVEL_BAND];

export interface BandTips {
  band: LevelBand;
  label: string;
  /** Three things to do now, most important first. */
  top: readonly GoldTip[];
  more: readonly GoldTip[];
}

export interface ClassGoldTips {
  classId: WowClassId;
  tips: readonly GoldTip[];
}

export interface GatheringTip {
  profession: string;
  what: string;
  pairsWith: string;
}
