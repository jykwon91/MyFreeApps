import { AUCTION_CUT } from "@/games/wow-forever/data/auctionHouse/reagentDemandRules";
import { luaString } from "@/games/wow-forever/lib/auctionHouse/luaString";
import { craftsThatPay, reagentDemand } from "@/games/wow-forever/lib/auctionHouse/reagentDemand";
import { mapPriceList } from "@/games/wow-forever/prices/auctionPrices";
import type { CraftingByProfession } from "@/games/wow-forever/types/auctionHouse/craftingByProfession";
import type { PriceListResponse } from "@/games/wow-forever/types/priceListResponse";

function epochSeconds(iso: string | null): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : Math.floor(ms / 1000);
}

/** `reagents[itemId]`: `{vendor = true}`, or `{leveling, recipes, professions}`. */
function reagentLines(crafting: CraftingByProfession): string[] {
  const lines = ["  reagents = {"];
  for (const [id, d] of [...reagentDemand(crafting)].sort((a, b) => a[0] - b[0])) {
    lines.push(
      d.vendor
        ? `    [${id}] = {vendor = true},`
        : `    [${id}] = {leveling = ${luaString(d.leveling)}, recipes = ${d.recipes}, professions = ${luaString(d.professions)}},`,
    );
  }
  lines.push("  },");
  return lines;
}

/**
 * The MGA Prices addon's `Data.lua`: each house's prices as
 * `items[itemId] = { market value, cheapest, on sale }` in copper, with when
 * Blizzard listed them, the house's cut of a sale (so the addon can say
 * whether an item nets more there than at a vendor), and its `crafts[itemId] = { recipe, profit }` (the
 * best craft that pays with that material there). `reagents` says which
 * leveling routes use each material. The top-level `updated` is the oldest
 * house's, so the addon's "download again" warning never understates how old
 * a price is.
 */
export function addonPriceLua(houses: readonly PriceListResponse[], crafting: CraftingByProfession): string {
  const out = [
    "-- MGA Prices data, from the MyGamingAssistant Auction house page (US).",
    "-- Download the addon again there to refresh these prices.",
    "MGAPricesData = {",
  ];
  const stamps: number[] = [];
  const houseLines: string[] = [];
  for (const response of houses) {
    const prices = mapPriceList(response);
    const updated = epochSeconds(prices.sourceUpdatedAt);
    if (updated !== null) stamps.push(updated);
    houseLines.push(`    ${prices.faction} = {`, `      cut = ${AUCTION_CUT[prices.faction]},`);
    if (updated !== null) houseLines.push(`      updated = ${updated},`);
    houseLines.push("      items = {");
    for (const p of prices.byId.values()) houseLines.push(`        [${p.itemId}] = {${p.marketValue}, ${p.minBuyout}, ${p.quantity}},`);
    houseLines.push("      },", "      crafts = {");
    const crafts = craftsThatPay(crafting, prices.byId, AUCTION_CUT[prices.faction]);
    for (const [id, c] of [...crafts].sort((a, b) => a[0] - b[0])) houseLines.push(`        [${id}] = {${luaString(c.recipe)}, ${c.profit}},`);
    houseLines.push("      },", "    },");
  }
  if (stamps.length > 0) out.push(`  updated = ${Math.min(...stamps)},`);
  out.push(...reagentLines(crafting), "  houses = {", ...houseLines, "  },", "}", "");
  return out.join("\n");
}
