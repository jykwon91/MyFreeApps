import { SKIN_LEVEL_HEADROOM } from "@/games/wow-forever/data/professions/gathering/gatheringConfig";
import { levelRange } from "@/games/wow-forever/food/recipeSources";
import { maxSkinnableLevel, skillToSkin } from "@/games/wow-forever/gathering/skinLevels";
import type { SkinBand } from "@/games/wow-forever/types/gathering/skinBand";

/** "Skill 115, level 18 → skin beasts level 15–20" (no level set: "Skill 115 → …"). */
export function skinBandLine(band: SkinBand): string {
  const beasts = `skin beasts ${levelRange([band.min, band.max])}`;
  if (band.level === null) return `Skill ${band.skill} → ${beasts}`;
  return `Skill ${band.skill}, level ${band.level} → ${beasts}`;
}

/** Why the band stops where it does, when it isn't just your skill — or how to narrow it. */
export function skinBandNote(band: SkinBand): string {
  if (band.level === null) return "Set your level above so this only lists beasts safe to fight.";
  if (band.levelCapped) {
    return `Your skill can skin up to level ${band.skillMax}; this stops ${SKIN_LEVEL_HEADROOM} levels above you so the beasts stay safe to fight.`;
  }
  return "";
}

/** "Skill 75 skins up to level 17." — a route row's tip, from the same rule as the band. */
export function skinReach(skill: number): string {
  return `Skill ${skill} skins up to level ${maxSkinnableLevel(skill)}.`;
}

/** "skill 1" / "skill 10–105" — what a bracket of mob levels needs. */
export function skillToSkinRange(minLevel: number, maxLevel: number): string {
  const lo = skillToSkin(minLevel);
  const hi = skillToSkin(maxLevel);
  if (lo === hi) return `skill ${lo}`;
  return `skill ${lo}–${hi}`;
}
