/**
 * Finds gear upgrade opportunities: member A knows a recipe that creates an
 * item whose score is meaningfully higher than what member B wears in that slot.
 *
 * Scoring uses each beneficiary's real spec (resolved from their talent tree
 * points) when available, falling back to class leveling weights when talents
 * are missing or the dominant tree isn't recognised.  The scorer is built once
 * per (classId, specId) pair and cached across all beneficiaries.
 *
 * Deduplication: for each (beneficiary_slug, blizzard_slot), only the best
 * upgrade is returned (highest score improvement).
 */
import { blizzardSlotLabel } from "@/games/wow-forever/lib/guild/blizzardSlotLabel";
import { LEVELING_SPEC_ID } from "@/games/wow-forever/data/classes";
import { UPGRADE_THRESHOLD_PCT } from "@/games/wow-forever/data/guild/guildHelpConfig";
import { BLIZZARD_SLOT_FOR, PAIRED_BLIZZARD_SLOTS } from "@/games/wow-forever/data/itemCompare/blizzardSlots";
import type { ItemSlot } from "@/games/wow-forever/data/itemSlots";
import { canWear } from "@/games/wow-forever/gear/gearFilters";
import { scorer } from "@/games/wow-forever/gear/rankGear";
import { recipeSpell } from "@/games/wow-forever/lib/character/characterProfessions";
import { characterClassId } from "@/games/wow-forever/lib/character/characterClassId";
import { resolveHelpSpecId } from "@/games/wow-forever/lib/guild/guildHelpSpec";
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

  // Per-beneficiary scorer, keyed by "{classId}|{specId}" to handle guild mates
  // of the same class who specced differently.  Uses the beneficiary's real spec
  // when it can be resolved from their talent trees; falls back to leveling weights.
  const scorerCache = new Map<string, (item: ClientItem) => number>();
  function scorerFor(member: GuildHelpMember): ((item: ClientItem) => number) | null {
    const classId = member.class_name ? characterClassId(member.class_name) : null;
    if (!classId) return null;
    const specId = resolveHelpSpecId(member.talents);
    // specId null → use leveling weights; non-null → use spec's level60 weights
    // (resolveWeights falls back to leveling if no Pawn entry exists for the spec).
    const cacheKey = specId !== null ? `${classId}|${specId}` : classId;
    const cached = scorerCache.get(cacheKey);
    if (cached) return cached;
    const fn = specId !== null
      ? scorer({ classId, specId }, false)
      : scorer({ classId, specId: LEVELING_SPEC_ID }, true);
    const wrapped = (item: ClientItem) => fn(item, clientBuild);
    scorerCache.set(cacheKey, wrapped);
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

      const scoreItem = scorerFor(beneficiary);
      const beneficiaryClassId = beneficiary.class_name ? characterClassId(beneficiary.class_name) : null;
      if (!scoreItem || !beneficiaryClassId) continue; // unknown class — skip scoring

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

        // Class restriction and armor/weapon proficiency at the beneficiary's level.
        if (!canWear(craftedClientItem, beneficiaryClassId, beneficiary.level)) continue;
        if (craftedClientItem.requiredLevel > beneficiary.level) continue;

        const candidateScore = scoreItem(craftedClientItem);
        if (candidateScore <= 0) continue; // useless for this class

        const blizzardSlots = blizzardSlotsFor(craftedClientItem.slot);
        for (const blizzardSlot of blizzardSlots) {
          const worn = equippedBySlot.get(blizzardSlot);
          if (!worn) continue; // not wearing anything in this slot — skip

          const wornClientItem = byId.get(worn.item_id);
          // A worn item we can't score (not in items.json, or random stats) would read as a bogus 100% upgrade.
          if (!wornClientItem || wornClientItem.randomSuffix) continue;
          const wornScore = scoreItem(wornClientItem);

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
            slot: { blizzard_slot: blizzardSlot, slot_label: blizzardSlotLabel(blizzardSlot) },
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
