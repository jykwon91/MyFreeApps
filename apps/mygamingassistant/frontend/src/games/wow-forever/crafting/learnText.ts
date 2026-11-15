import type { LearnAt } from "@/games/wow-forever/types/crafting";
import type { RecipeQuest } from "@/games/wow-forever/types/recipeQuest";

/** "skill 40", or "about skill 40" when the Forever skill is an estimate. */
export function itemSkillText(learn: Extract<LearnAt, { kind: "item" }>): string {
  return learn.estimated ? `about skill ${learn.skill}` : `skill ${learn.skill}`;
}

/** "Quest: Sacred Cloth (Classic)" / "Taught by Gloom'rel (Classic)" — who teaches a recipe no trainer does. */
export function classicTeacherText(teacher: { quests: readonly RecipeQuest[] } | { npcs: readonly string[] }): string {
  if ("quests" in teacher) return `Quest: ${[...new Set(teacher.quests.map((q) => q.title))].join(" or ")} (Classic)`;
  return `Taught by ${teacher.npcs.join(" or ")} (Classic)`;
}

/** Where a route recipe is learned, in words: "Known when you train Tailoring", "Tailoring trainer, at skill 75", "Pattern: Red Linen Robe (skill 40)". */
export function learnText(learn: LearnAt, professionLabel: string): string {
  if (learn.kind === "start") return `Known when you train ${professionLabel}`;
  if (learn.kind === "item") return `${learn.item} (${itemSkillText(learn)})`;
  if (learn.kind === "quest" || learn.kind === "npc") return `${classicTeacherText(learn)}, at about skill ${learn.skill}`;
  // No Classic trainer teaches a recipe Forever added — don't name one.
  if (learn.newInForever) return `New in Forever: source not known yet (probably a ${professionLabel} trainer, at about skill ${learn.skill})`;
  if (learn.estimated) return `${professionLabel} trainer, at about skill ${learn.skill}`;
  return `${professionLabel} trainer, at skill ${learn.skill}`;
}
