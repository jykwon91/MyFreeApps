/**
 * Finds enchant opportunities: member A knows an enchant for a slot that member
 * B wears unenchanted, and the enchant adds something B's class uses.
 *
 * Each enchant is valued with B's stat weights (their spec's, else their
 * class's leveling weights): +7 Strength is worth nothing to a Warlock, so it
 * is never suggested to one. For each (beneficiary_slug, blizzard_slot) only the
 * enchant worth most to B is returned; between crafters of the same enchant,
 * the highest Enchanting skill wins.
 */
import { enchantSlot } from "@/games/wow-forever/crafting/cheapestRoute";
import { ENCHANTING_SKILL_LINE_ID, ENCHANT_SLOT_TARGETS } from "@/games/wow-forever/data/guild/guildHelpConfig";
import type { StatWeights } from "@/games/wow-forever/data/weights/statWeights";
import { recipeSpell } from "@/games/wow-forever/lib/character/characterProfessions";
import { enchantEffect } from "@/games/wow-forever/lib/guild/enchantEffect";
import { enchantValue } from "@/games/wow-forever/lib/guild/enchantValue";
import { guildHelpWeights } from "@/games/wow-forever/lib/guild/guildHelpWeights";
import { mainStatPoint } from "@/games/wow-forever/lib/guild/mainStatPoint";
import type { ClientItem } from "@/games/wow-forever/types/clientItem";
import type { CraftingFile } from "@/games/wow-forever/types/crafting";
import type { BestEnchant } from "@/games/wow-forever/types/guild/bestEnchant";
import type { GuildHelpEquippedItem } from "@/games/wow-forever/types/guild/guildHelpEquippedItem";
import type { GuildHelpMember } from "@/games/wow-forever/types/guild/guildHelpMember";
import type { GuildHelpMode } from "@/games/wow-forever/types/guild/guildHelpMode";
import type { GuildMatch, GuildMatchBeneficiary, GuildMatchCrafter } from "@/games/wow-forever/types/guild/guildMatch";
import type { ScoredEnchant } from "@/games/wow-forever/types/guild/scoredEnchant";

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
 * Whether (value, crafter skill, crafter slug, spell) beats the best so far: value first, then the wearer
 * enchanting it themselves, then skill, then a stable order.
 */
function isBetter(value: number, skill: number, slug: string, spell: number, beneficiarySlug: string, best: BestEnchant): boolean {
  if (value !== best.value) return value > best.value;
  const selfMade = slug === beneficiarySlug;
  if (selfMade !== (best.match.crafter.slug === beneficiarySlug)) return selfMade;
  if (skill !== best.match.crafter.skill) return skill > best.match.crafter.skill;
  if (slug !== best.match.crafter.slug) return slug < best.match.crafter.slug;
  return spell > (best.match.proposed.spell ?? 0);
}

/**
 * Compute all enchant matches from the members' stored sheets and the
 * Enchanting crafting file. `itemsById` gives worn weapons' speed, so flat
 * weapon damage can be weighed as DPS. `crafters` (default: every member)
 * limits whose enchants count; `mode` picks PvE or PvP weights.
 */
export function computeEnchantMatches(
  members: readonly GuildHelpMember[],
  enchantingFile: Pick<CraftingFile, "recipes">,
  itemsById: ReadonlyMap<number, ClientItem>,
  crafters: readonly GuildHelpMember[] = members,
  mode: GuildHelpMode = "pve",
): GuildMatch[] {
  // Spell → enchant recipe, only for enchants whose effect a stat weight can score.
  const enchantBySpell = new Map<number, ScoredEnchant>();
  for (const recipe of enchantingFile.recipes) {
    if (!recipe.enchant) continue;
    const effect = enchantEffect(recipe.effect ?? null);
    if (effect) enchantBySpell.set(recipe.spell, { recipe, effect });
  }
  if (enchantBySpell.size === 0) return [];

  const weightsCache = new Map<string, StatWeights | null>();
  const weightsFor = (member: GuildHelpMember) => {
    if (!weightsCache.has(member.slug)) weightsCache.set(member.slug, guildHelpWeights(member, mode));
    return weightsCache.get(member.slug) ?? null;
  };

  // Key: "beneficiary_slug|blizzard_slot" → best match so far and its value to the beneficiary.
  const best = new Map<string, BestEnchant>();

  for (const crafter of crafters) {
    const crafterEnch = crafter.professions.find((p) => p.profession_id === ENCHANTING_SKILL_LINE_ID);
    if (!crafterEnch) continue;

    const knownEnchants: ScoredEnchant[] = [];
    for (const abilityId of crafter.recipe_ability_ids) {
      const spell = recipeSpell(abilityId);
      if (spell === null) continue;
      const enchant = enchantBySpell.get(spell);
      if (enchant) knownEnchants.push(enchant);
    }
    if (knownEnchants.length === 0) continue;

    for (const beneficiary of members) {
      const weights = weightsFor(beneficiary);
      if (!weights) continue;
      const floor = mainStatPoint(weights);

      for (const item of beneficiary.equipped) {
        if (item.enchantments.length > 0) continue; // already enchanted
        const weaponSpeed = itemsById.get(item.item_id)?.weapon?.speed ?? null;

        for (const { recipe, effect } of knownEnchants) {
          const slot = enchantSlot(recipe.name);
          if (!slot || !itemMatchesEnchantSlot(item, slot)) continue;
          const value = enchantValue(effect, weights, weaponSpeed);
          if (value <= 0 || value < floor) continue; // under one point of their main stat

          const key = `${beneficiary.slug}|${item.slot}`;
          const existing = best.get(key);
          if (existing && !isBetter(value, crafterEnch.skill, crafter.slug, recipe.spell, beneficiary.slug, existing)) continue;

          const matchCrafter = crafterFor(crafter, ENCHANTING_SKILL_LINE_ID);
          if (!matchCrafter) continue;

          best.set(key, {
            value,
            match: {
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
                effect: recipe.effect ?? null,
              },
              upgrade: null,
            },
          });
        }
      }
    }
  }

  return [...best.values()].map((b) => b.match);
}
