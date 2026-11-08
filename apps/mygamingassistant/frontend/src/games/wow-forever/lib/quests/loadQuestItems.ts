/** Lightweight item name + slot + type lookup for quest reward display. */

export interface QuestRewardItem {
  name: string;
  slot: string;
  itemType: string;
}

interface QuestRewardItemsFile {
  columns: string[];
  items: Record<string, [string, string, string]>;
}

let cached: Promise<ReadonlyMap<number, QuestRewardItem>> | null = null;

/** The quest reward items map, loaded once in its own chunk. */
export function loadQuestItems(): Promise<ReadonlyMap<number, QuestRewardItem>> {
  if (!cached) {
    cached = import("@/games/wow-forever/data/quests/questRewardItems.json").then((file) => {
      const doc = file.default as unknown as QuestRewardItemsFile;
      const at = (name: string) => doc.columns.indexOf(name);
      const iName = at("name");
      const iSlot = at("slot");
      const iType = at("itemType");
      const map = new Map<number, QuestRewardItem>();
      for (const [idStr, row] of Object.entries(doc.items)) {
        map.set(Number(idStr), { name: row[iName], slot: row[iSlot], itemType: row[iType] });
      }
      return map;
    });
    cached.catch(() => {
      cached = null;
    });
  }
  return cached;
}
