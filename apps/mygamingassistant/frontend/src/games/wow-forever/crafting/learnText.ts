import type { LearnAt } from "@/games/wow-forever/types/crafting";

/** Where a route recipe is learned, in words: "Known when you train Tailoring", "Tailoring trainer, at skill 75", "Pattern: Red Linen Robe (skill 40)". */
export function learnText(learn: LearnAt, professionLabel: string): string {
  if (learn.kind === "start") return `Known when you train ${professionLabel}`;
  if (learn.kind === "item") return `${learn.item} (skill ${learn.skill})`;
  // No Classic trainer teaches a recipe Forever added — don't name one.
  if (learn.newInForever) return `New in Forever: source not known yet (probably a ${professionLabel} trainer, at about skill ${learn.skill})`;
  if (learn.estimated) return `${professionLabel} trainer, at about skill ${learn.skill}`;
  return `${professionLabel} trainer, at skill ${learn.skill}`;
}
