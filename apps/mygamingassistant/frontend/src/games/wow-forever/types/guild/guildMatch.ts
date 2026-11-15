import type { CraftReagent } from "@/games/wow-forever/types/crafting";

/** Enchant-missing or gear-upgrade match between a crafter and a beneficiary. */
export type GuildMatchType = "enchant" | "gear";

/** The guild member who can make the item or enchant. */
export interface GuildMatchCrafter {
  slug: string;
  name: string;
  surname: string;
  class_name: string | null;
  profession_id: number;
  profession_name: string;
  skill: number;
  max_skill: number;
}

/** The guild member who would benefit. */
export interface GuildMatchBeneficiary {
  slug: string;
  name: string;
  surname: string;
  class_name: string | null;
  level: number;
}

/** The item slot this match covers (Blizzard's slot name + friendly label). */
export interface GuildMatchSlot {
  blizzard_slot: string;
  slot_label: string;
}

/** What the beneficiary currently wears in this slot. */
export interface GuildMatchWorn {
  item_id: number;
  name: string;
  item_level: number;
}

/** The crafted item or enchant being proposed. */
export interface GuildMatchProposed {
  /** The crafting-file spell id. */
  spell: number;
  name: string;
  /** Null for enchants (they produce no item). */
  item_id: number | null;
  /** Null for enchants or when the item level is unknown. */
  item_level: number | null;
  reagents: CraftReagent[];
  /** What an enchant does, from the Forever client ("... 6 additional points of damage."); null for gear or when unknown. */
  effect: string | null;
}

/**
 * One help opportunity: member A can make something that member B needs.
 *
 * Deduped by (beneficiary_slug, slot): the best crafter per slot wins, so the
 * list stays readable even in a large guild.
 */
export interface GuildMatch {
  type: GuildMatchType;
  crafter: GuildMatchCrafter;
  beneficiary: GuildMatchBeneficiary;
  slot: GuildMatchSlot;
  worn: GuildMatchWorn;
  proposed: GuildMatchProposed;
  /**
   * How much better the proposed item is vs what the beneficiary wears.
   * Null for enchants (always a net gain on an unenchanted slot).
   */
  upgrade_pct: number | null;
}
