import type { Faction } from "@/games/wow-forever/types/worldMap";

/** Made by a profession — from the Forever client's recipes. */
export interface CraftedGearSource {
  kind: "crafted";
  profession: string;
  /** Skill needed to learn the recipe. */
  skill: number;
}

/** A Classic quest reward (cmangos) — may differ in Forever. */
export interface QuestGearSource {
  kind: "quest";
  title: string;
  /** Level you can take the quest at. */
  minLevel: number;
  questLevel: number;
  side: Faction;
  /** Class ids the quest is limited to; empty = every class. */
  classes: readonly string[];
}

/** A Classic dungeon-boss drop (cmangos) — may differ in Forever. */
export interface DropGearSource {
  kind: "drop";
  boss: string;
  /** Null when the dungeon isn't on the World Map's list. */
  dungeon: { name: string; level: number; enterAt: number } | null;
}

/** Where an item comes from. Nothing known = no sources (the page says "Source unknown"). */
export type GearSource = CraftedGearSource | QuestGearSource | DropGearSource;
