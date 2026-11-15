/**
 * Finds gear upgrade opportunities: member A knows a recipe that creates an
 * item whose score is meaningfully higher than what member B wears in that slot.
 *
 * Scoring uses LEVELING_SPEC_ID (class leveling weights) for everyone — we don't
 * have spec info from the help endpoint.  The scorer is built once per
 * beneficiary class and reused across all slots for that beneficiary.
 *
 * Deduplication: for each (beneficiary_slug, blizzard_slot), only the best
 * upgrade is returned (highest score improvement).
 */
import { LEVELING_SPEC_ID } from "@/games/wow-forever/data/classes";
import { UPGRADE_THRESHOLD_PCT } from "@/games/wow-forever/data/guild/guildHelpConfig";
import { BLIZZARD_SLOT_FOR, PAIRED_BLIZZARD_SLOTS } from "@/games/wow-forever/data/itemCompare/blizzardSlots";
import type { ItemSlot } from "@/games/wow-forever/data/itemSlots";
import { scorer } from "@/games/wow-forever/gear/rankGear";
import { recipeSpell } from "@/games/wow-forever/lib/character/characterProfessions";
import { characterClassId } from "@/games/wow-forever/lib/character/characterClassId";
import type { ClientItem } from "@/games/wow-forever/types/clientItem";
import type { ClientItemList } from "@/games/wow-forever/types/clientItemList";
import type { CraftRecipe, CraftingFile } from "@/games/wow-forever/types/crafting";
import type { GuildHelpEquippedItem } from "@/games/wow-forever/types/guild/guildHelpEquippedItem";
import type { GuildHelpMember } from "@/games/wow-forever/types/guild/guildHelpMember";
import type { GuildMatch, GuildMatchBeneficiary, GuildMatchCrafter } from "@/games/wow-forever/types/guild/guildMatch";

const PERCENT = 100;

/** All Blizzard slots a ClientItem slot could occupy (singular or paired rings/trinkets). */
function blizzardSlotsFor(slot: ItemSlot): readonly string[] {
  const single = BLIZZARD_SLOT_FOR[slot];
  if (single) return [single];
  const paired = PAIRED_BLIZZARD_SLOTS[slot];
  return paired ?? [];
}

/** Build the crafter descriptor for a match. */
function crafterFor(member: GuildHelpMember, professionId: number): GuildMatchCrafter | null {
  const prof = member.professions.find((p) => p.profession_id === professionId);
  if (!prof) return null;
  return {
    slug: member.slug,
    name: member.name,
    surname: member.surname,
    class_name: member.class_name,
    profession_id: prof.profession_id,
    profession_name: prof.name,
    skill: prof.skill,
    max_skill: prof.max_skill,
  };
}

/** Build the beneficiary descriptor for a match. */
function beneficiaryFor(member: GuildHelpMember): GuildMatchBeneficiary {
  return { slug: member.slug, name: member.name, surname: member.surname, class_name: member.class_name, level: member.level };
}

/** Upgrade percent: how much better the crafted item is vs the worn one (> 0 means better). */
function upgradePct(craftedScore: number, wornScore: number): number {
  if (wornScore <= 0) return craftedScore > 0 ? PERCENT : 0;
  return Math.round(((craftedScore - wornScore) / wornScore) * PERCENT);
}

/**
 * Compute all gear upgrade matches from the members' stored sheets and each
 * crafting profession's file.
 *
 * Returns one match per (beneficiary_slug, blizzard_slot) — the crafted item
 * with the best score improvement. Items not in items.json are skipped.
 */
export function computeGearMatches(
  members: readonly GuildHelpMember[],
  craftingFiles: ReadonlyMap<number, Pick<CraftingFile, "recipes">>,
  itemList: ClientItemList,
): GuildMatch[] {
  const { byId, clientBuild } = itemList;

  // Build a spell → { recipe, professionId } map for all gear-creating recipes.
  const gearBySpell = new Map<number, { recipe: CraftRecipe; professionId: number }>();
  for (const [professionId, file] of craftingFiles) {
    for (const recipe of file.recipes) {
      if (recipe.creates && !recipe.enchant && recipe.creates.id) {
        gearBySpell.set(recipe.spell, { recipe, professionId });
      }
    }
  }
  if (gearBySpell.size === 0) return [];

  // Per-beneficiary scorer (class leveling weights), keyed by class_name.
  const scorerCache = new Map<string, (item: ClientItem) => number>();
  function scorerFor(className: string | null): ((item: ClientItem) => number) | null {
    const classId = className ? characterClassId(className) : null;
    if (!classId) return null;
    const cached = scorerCache.get(classId);
    if (cached) return cached;
    const fn = scorer({ classId, specId: LEVELING_SPEC_ID }, true);
    const wrapped = (item: ClientItem) => fn(item, clientBuild);
    scorerCache.set(classId, wrapped);
    return wrapped;
  }

  // Key: "beneficiary_slug|blizzard_slot" → best match so far (highest upgrade_pct).
  const best = new Map<string, GuildMatch>();

  for (const crafter of members) {
    // Build a lookup of which professions this crafter has.
    const crafterProfIds = new Set(crafter.professions.map((p) => p.profession_id));

    // Map this crafter's ability ids to gear recipes.
    const knownGear: { recipe: CraftRecipe; professionId: number }[] = [];
    for (const abilityId of crafter.recipe_ability_ids) {
      const spell = recipeSpell(abilityId);
      if (spell === null) continue;
      const entry = gearBySpell.get(spell);
      if (!entry) continue;
      if (!crafterProfIds.has(entry.professionId)) continue;
      knownGear.push(entry);
    }
    if (knownGear.length === 0) continue;

    for (const beneficiary of members) {
      if (beneficiary.slug === crafter.slug) continue;

      const scoreItem = scorerFor(beneficiary.class_name);
      if (!scoreItem) continue; // unknown class — skip scoring

      // Index the beneficiary's equipped items by Blizzard slot for fast lookup.
      const equippedBySlot = new Map<string, GuildHelpEquippedItem>();
      for (const item of beneficiary.equipped) {
        equippedBySlot.set(item.slot, item);
      }

      for (const { recipe, professionId } of knownGear) {
        const createsId = recipe.creates!.id;
        const craftedClientItem = byId.get(createsId);
        if (!craftedClientItem) continue; // not in items.json — skip
        if (craftedClientItem.randomSuffix) continue; // random stats — skip

        // Check class restriction.
        if (craftedClientItem.classes !== null) {
          const beneficiaryClassId = beneficiary.class_name ? characterClassId(beneficiary.class_name) : undefined;
          if (!beneficiaryClassId || !craftedClientItem.classes.includes(beneficiaryClassId)) continue;
        }

        const candidateScore = scoreItem(craftedClientItem);
        if (candidateScore <= 0) continue; // useless for this class

        const blizzardSlots = blizzardSlotsFor(craftedClientItem.slot);
        for (const blizzardSlot of blizzardSlots) {
          const worn = equippedBySlot.get(blizzardSlot);
          if (!worn) continue; // not wearing anything in this slot — skip

          const wornClientItem = byId.get(worn.item_id);
          const wornScore = wornClientItem && !wornClientItem.randomSuffix ? scoreItem(wornClientItem) : 0;

          const pct = upgradePct(candidateScore, wornScore);
          if (pct < UPGRADE_THRESHOLD_PCT) continue; // not meaningfully better

          const key = `${beneficiary.slug}|${blizzardSlot}`;
          const existing = best.get(key);
          if (existing && (existing.upgrade_pct ?? 0) >= pct) continue;

          const matchCrafter = crafterFor(crafter, professionId);
          if (!matchCrafter) continue;

          best.set(key, {
            type: "gear",
            crafter: matchCrafter,
            beneficiary: beneficiaryFor(beneficiary),
            slot: { blizzard_slot: blizzardSlot, slot_label: recipe.creates!.name },
            worn: { item_id: worn.item_id, name: worn.name, item_level: worn.item_level },
            proposed: {
              spell: recipe.spell,
              name: recipe.creates!.name,
              item_id: createsId,
              item_level: craftedClientItem.itemLevel,
              reagents: recipe.reagents,
            },
            upgrade_pct: pct,
          });
        }
      }
    }
  }

  return [...best.values()];
}
