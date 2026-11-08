import type { BossLootItem } from "@/games/wow-forever/types/dungeons/bossLootItem";

/** An item's Forever name and kind, from `dungeons/lootItems.json` (boss drops and quest rewards). */
export type LootItemInfo = Omit<BossLootItem, "id" | "chance">;
