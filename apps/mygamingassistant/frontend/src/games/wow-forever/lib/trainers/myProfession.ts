import { guideProfession, recipeSpell } from "@/games/wow-forever/lib/character/characterProfessions";
import type { CharacterResponse } from "@/games/wow-forever/types/character/characterResponse";
import type { CraftingProfession } from "@/games/wow-forever/types/crafting";
import type { MyProfession } from "@/games/wow-forever/types/trainers/myProfession";

/**
 * The character's skill and known recipes in `profession`, or null when they haven't learned it (or
 * Blizzard didn't send their professions). First Aid is a secondary profession, so both lists are read. Blizzard's recipe ids are mapped to our recipe spells.
 */
export function myProfession(character: CharacterResponse, profession: CraftingProfession): MyProfession | null {
  const professions = character.professions;
  const learned = [...(professions?.primaries ?? []), ...(professions?.secondaries ?? [])].find((p) => guideProfession(p.id) === profession);
  if (!learned) return null;
  const knownSpells = new Set<number>();
  for (const recipe of learned.recipes) {
    const spell = recipeSpell(recipe.id);
    if (spell !== null) knownSpells.add(spell);
  }
  return {
    characterName: [character.name, character.surname].filter(Boolean).join(" "),
    skill: learned.skill,
    maxSkill: learned.max_skill,
    knownSpells,
  };
}
