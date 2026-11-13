import { formatPrice } from "@/games/wow-forever/crafting/matPrices";
import type { ForeverDungeonQuest } from "@/games/wow-forever/types/dungeons/foreverDungeonQuest";
import type { ForeverQuestReputation } from "@/games/wow-forever/types/dungeons/foreverQuestReputation";
import type { ForeverQuestStanding } from "@/games/wow-forever/types/dungeons/foreverQuestStanding";

/** "3,200 XP · 8s · 2 items": what the quest gives, at a glance; "" when it gives nothing listed. */
export function foreverQuestRewardSummary(quest: Pick<ForeverDungeonQuest, "xp" | "money" | "items" | "itemsChoice">): string {
  return [
    quest.xp > 0 ? `${quest.xp.toLocaleString("en-US")} XP` : null,
    quest.money > 0 ? formatPrice(quest.money) : null,
    itemCountText(quest),
  ]
    .filter(Boolean)
    .join(" · ");
}

/** "choice of 2 items", "1 item", "3 items"; null when there are none. */
export function itemCountText(quest: Pick<ForeverDungeonQuest, "items" | "itemsChoice">): string | null {
  const count = quest.items.length;
  if (count === 0) return null;
  if (quest.itemsChoice) return `choice of ${count} items`;
  if (count === 1) return "1 item";
  return `${count} items`;
}

/** "Neutral or better with Timbermaw Hold". */
export function standingText(needs: ForeverQuestStanding): string {
  return `${needs.standing} or better with ${needs.faction}`;
}

/** "+100 Ironforge" (a loss shows its minus). */
export function reputationText(rep: ForeverQuestReputation): string {
  return `${rep.amount > 0 ? "+" : ""}${rep.amount} ${rep.faction}`;
}
