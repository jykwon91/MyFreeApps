import { describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import addonLua from "../../addon/MGAPrices/MGAPrices.lua?raw";
import addonToc from "../../addon/MGAPrices/MGAPrices.toc?raw";
import emptyData from "../../addon/MGAPrices/Data.lua?raw";
import { addonPriceLua } from "@/games/wow-forever/lib/auctionHouse/addonPriceLua";
import { pricesAddonZip } from "@/games/wow-forever/lib/auctionHouse/pricesAddonZip";
import type { PriceFaction } from "@/games/wow-forever/types/priceFaction";
import type { PriceListResponse } from "@/games/wow-forever/types/priceListResponse";
import { runAddonLua } from "@/test/addonLua/runAddonLua";

const COLUMNS = ["item_id", "market_value", "min_buyout", "quantity", "listings", "name"];
const ALLIANCE_AT = "2025-11-09T15:00:00Z"; // 1762700400
const HORDE_AT = "2025-11-09T16:00:00Z";

function house(faction: PriceFaction, updated: string | null, items: PriceListResponse["items"]): PriceListResponse {
  return { region: "us", server: "pvp", faction, source_updated_at: updated, fetched_at: updated, columns: COLUMNS, items };
}

const HOUSES = [
  house("alliance", ALLIANCE_AT, [
    [2589, 30, 25, 8109, 358, "Linen Cloth"],
    [4611, null, null, 0, 0, "Blue Pearl"],
  ]),
  house("horde", HORDE_AT, [[2589, 35, 30, 500, 40, "Linen Cloth"]]),
  house("neutral", null, []),
];

const DATA = addonPriceLua(HOUSES);
const HOUR = 3600;
const ALLIANCE_EPOCH = Date.parse(ALLIANCE_AT) / 1000;

function tooltip(scenario: string, data = DATA): string[] {
  return runAddonLua([
    ["Data.lua", data],
    ["MGAPrices.lua", addonLua],
    ["scenario", `NOW = ${ALLIANCE_EPOCH + 2 * HOUR}\n${scenario}`],
  ]);
}

describe("addonPriceLua", () => {
  it("writes each house's market value, cheapest and amount on sale, and leaves out items with no price", () => {
    expect(DATA).toContain("[2589] = {30, 25, 8109},");
    expect(DATA).toContain("[2589] = {35, 30, 500},");
    expect(DATA).not.toContain("[4611]");
    expect(DATA).toContain(`  updated = ${ALLIANCE_EPOCH},`);
  });
});

describe("the download", () => {
  it("is the addon folder with today's prices in Data.lua", () => {
    const files = unzipSync(pricesAddonZip(HOUSES));
    expect(Object.keys(files).filter((name) => !name.endsWith("/")).sort()).toEqual(["MGAPrices/Data.lua", "MGAPrices/MGAPrices.lua", "MGAPrices/MGAPrices.toc"]);
    expect(strFromU8(files["MGAPrices/Data.lua"])).toBe(DATA);
    expect(strFromU8(files["MGAPrices/MGAPrices.toc"])).toBe(addonToc);
  });

  it("loads every file named in the .toc, for the Forever client", () => {
    expect(addonToc).toMatch(/^## Interface: 16001$/m);
    const listed = addonToc.split(/\r?\n/).filter((l) => l && !l.startsWith("#"));
    expect(listed).toEqual(["Data.lua", "MGAPrices.lua"]);
  });
});

describe("MGA Prices in the game's tooltips", () => {
  it("shows your faction's price, the cheapest listing and how many are on sale", () => {
    expect(tooltip("hover(GameTooltip, 2589)")).toEqual(["Auction (Alliance) | 30c", "Cheapest · on sale | 25c · 8109"]);
    expect(tooltip('faction = "Horde"; hover(GameTooltip, 2589)')).toEqual(["Auction (Horde) | 35c", "Cheapest · on sale | 30c · 500"]);
  });

  it("prices the whole stack when you hover a stack", () => {
    expect(tooltip("GameTooltip.owner = { count = 20 }; hover(GameTooltip, 2589)")).toEqual([
      "Auction (Alliance) ×20 | 600c",
      "Each | 30c",
      "Cheapest · on sale | 25c · 8109",
    ]);
  });

  it("shows every house while Shift is held", () => {
    expect(tooltip("shift = true; hover(GameTooltip, 2589)")).toEqual([
      "Auction (Alliance) | 30c · 8109 on sale",
      "Auction (Horde) | 35c · 500 on sale",
      "Auction (Blackwater) | not on sale",
    ]);
  });

  it("says 'not on sale', but stays quiet on soulbound items", () => {
    expect(tooltip("hover(GameTooltip, 4611)")).toEqual(["Auction (Alliance) | not on sale"]);
    expect(tooltip("bind[4611] = 1; hover(GameTooltip, 4611)")).toEqual([]);
  });

  it("prices chat links but not the gear-compare tooltips, and each item once", () => {
    expect(tooltip("hover(ItemRefTooltip, 2589)")).toHaveLength(2);
    expect(tooltip("hover(ShoppingTooltip1, 2589)")).toEqual([]);
    expect(tooltip("hover(GameTooltip, 2589); hover(GameTooltip, 2589)")).toHaveLength(4);
  });

  it("asks for a fresh download once the prices are a day old", () => {
    const lines = tooltip(`NOW = NOW + 2 * 86400; hover(GameTooltip, 2589)`);
    expect(lines[lines.length - 1]).toBe(
      "MGA prices updated 2 days ago — download again on the site",
    );
  });

  it("explains itself before any prices are downloaded, and /mgaprices says what's loaded", () => {
    expect(tooltip("hover(GameTooltip, 2589)", emptyData)).toEqual(["MGA Prices: no prices loaded — /mgaprices"]);
    const status = tooltip('SlashCmdList.MGAPRICES("")');
    expect(status[0]).toBe("chat: |cff33aaffMGA Prices:|r Alliance: 1 item, updated 2 hours ago.");
    expect(status[1]).toBe("chat: |cff33aaffMGA Prices:|r Horde: 1 item, updated 1 hour ago.");
    expect(status[2]).toBe("chat: |cff33aaffMGA Prices:|r Blackwater: no prices.");
  });
});
