/**
 * Finds enchant opportunities: member A knows an enchant for a slot that member
 * B wears unenchanted.
 *
 * Deduplication: for each (beneficiary_slug, blizzard_slot) pair, only the
 * crafter with the highest Enchanting skill is returned — there is no value in
 * listing every enchanter who knows the same recipe for the same slot.
 */
import { enchantSlot } from "@/games/wow-forever/crafting/cheapestRoute";
import { ENCHANTING_SKILL_LINE_ID, ENCHANT_SLOT_TARGETS } from "@/games/wow-forever/data/guild/guildHelpConfig";
import { recipeSpell } from "@/games/wow-forever/lib/character/characterProfessions";
import type { CraftRecipe, CraftingFile } from "@/games/wow-forever/types/crafting";
import type { GuildHelpEquippedItem } from "@/games/wow-forever/types/guild/guildHelpEquippedItem";
import type { GuildHelpMember } from "@/games/wow-forever/types/guild/guildHelpMember";
import type { GuildMatch, GuildMatchBeneficiary, GuildMatchCrafter } from "@/games/wow-forever/types/guild/guildMatch";

/** Check whether a worn item's slot + inventory_type matches an enchant slot target. */
function itemMatchesEnchantSlot(item: GuildHelpEquippedItem, enchantSlotName: string): boolean {
  const target = ENCHANT_SLOT_TARGETS[enchantSlotName as keyof typeof ENCHANT_SLOT_TARGETS];
  if (!target) return false;
  if (!target.blizzardSlots.includes(item.slot)) return false;
  if (target.inventoryTypeIs !== null && item.inventory_type !== target.inventoryTypeIs) return false;
  if (target.inventoryTypesNot.includes(item.inventory_type)) return false;
  return true;
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

/**
 * Compute all enchant matches from the members' stored sheets and the
 * Enchanting crafting file.
 *
 * Returns one match per (beneficiary_slug, blizzard_slot) — the crafter with
 * the highest Enchanting skill. If two crafters tie on skill, the one that
 * sorts first alphabetically wins (deterministic).
 */
export function computeEnchantMatches(
  members: readonly GuildHelpMember[],
  enchantingFile: Pick<CraftingFile, "recipes">,
): GuildMatch[] {
  // Build a spell → recipe map for Enchanting enchant recipes only.
  const enchantBySpell = new Map<number, CraftRecipe>();
  for (const recipe of enchantingFile.recipes) {
    if (recipe.enchant) enchantBySpell.set(recipe.spell, recipe);
  }
  if (enchantBySpell.size === 0) return [];

  // Key: "beneficiary_slug|blizzard_slot" → best match so far.
  const best = new Map<string, GuildMatch>();

  for (const crafter of members) {
    const crafterEnch = crafter.professions.find((p) => p.profession_id === ENCHANTING_SKILL_LINE_ID);
    if (!crafterEnch) continue;

    // The spells this crafter knows that are enchant recipes.
    const knownEnchants: CraftRecipe[] = [];
    for (const abilityId of crafter.recipe_ability_ids) {
      const spell = recipeSpell(abilityId);
      if (spell === null) continue;
      const recipe = enchantBySpell.get(spell);
      if (recipe) knownEnchants.push(recipe);
    }
    if (knownEnchants.length === 0) continue;

    for (const beneficiary of members) {
      if (beneficiary.slug === crafter.slug) continue;

      for (const item of beneficiary.equipped) {
        if (item.enchantments.length > 0) continue; // already enchanted

        for (const recipe of knownEnchants) {
          const slot = enchantSlot(recipe.name);
          if (!slot) continue;
          if (!itemMatchesEnchantSlot(item, slot)) continue;

          const key = `${beneficiary.slug}|${item.slot}`;
          const existing = best.get(key);

          // Keep the highest-skill crafter; break ties by slug (alphabetical, deterministic).
          const isFirstOrBetter =
            !existing ||
            crafterEnch.skill > (existing.crafter.skill) ||
            (crafterEnch.skill === existing.crafter.skill && crafter.slug < existing.crafter.slug);

          if (!isFirstOrBetter) continue;

          const matchCrafter = crafterFor(crafter, ENCHANTING_SKILL_LINE_ID);
          if (!matchCrafter) continue;

          best.set(key, {
            type: "enchant",
            crafter: matchCrafter,
            beneficiary: beneficiaryFor(beneficiary),
            slot: { blizzard_slot: item.slot, slot_label: slot },
            worn: { item_id: item.item_id, name: item.name, item_level: item.item_level },
            proposed: {
              spell: recipe.spell,
              name: recipe.name,
              item_id: null,
              item_level: null,
              reagents: recipe.reagents,
            },
            upgrade_pct: null,
          });
        }
      }
    }
  }

  return [...best.values()];
}
