/** `search_items` — the item finder's own search (`searchItems`) over the Forever item list. */
import { ASK_CARD } from "@/games/wow-forever/data/ask/askCardKinds";
import { ASK_LIMITS } from "@/games/wow-forever/data/ask/askLimits";
import { ASK_TOOL } from "@/games/wow-forever/data/ask/askTools";
import { QUALITY_LABELS } from "@/games/wow-forever/data/itemQualityStyles";
import { searchItems } from "@/games/wow-forever/lib/itemSearch";
import type { AskQueryInput } from "@/games/wow-forever/types/ask/askQueryInput";
import type { AskToolData } from "@/games/wow-forever/types/ask/askToolData";
import type { AskToolOutcome } from "@/games/wow-forever/types/ask/askToolOutcome";

export async function searchItemsTool(input: AskQueryInput, data: AskToolData): Promise<AskToolOutcome> {
  const list = await data.loadItems();
  const found = searchItems(list, input.query, { slot: null, usableBy: null, bracket: "level60" });
  const items = found.items.slice(0, Math.min(input.limit, ASK_LIMITS.cardRows));
  const result = {
    results: items.map((item) => ({
      id: item.id,
      name: item.name,
      quality: QUALITY_LABELS[item.quality],
      item_level: item.itemLevel,
      required_level: item.requiredLevel,
      slot: item.slot,
    })),
    total: found.items.length,
    spelling_corrected: found.fuzzy,
  };
  const card: AskToolOutcome["card"] = items.length
    ? { kind: ASK_CARD.items, query: input.query, items, total: found.items.length }
    : { kind: ASK_CARD.noResults, tool: ASK_TOOL.searchItems, query: input.query };
  return { content: JSON.stringify(result), isError: false, card };
}
