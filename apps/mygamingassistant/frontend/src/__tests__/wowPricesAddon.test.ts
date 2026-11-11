import { describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import addonLua from "../../addon/MGAPrices/MGAPrices.lua?raw";
import addonToc from "../../addon/MGAPrices/MGAPrices.toc?raw";
import emptyData from "../../addon/MGAPrices/Data.lua?raw";
import { loadAllCraftingData } from "@/games/wow-forever/crafting/loadCraftingData";
import { addonPriceLua } from "@/games/wow-forever/lib/auctionHouse/addonPriceLua";
import { pricesAddonZip } from "@/games/wow-forever/lib/auctionHouse/pricesAddonZip";
import { craftsThatPay, reagentDemand } from "@/games/wow-forever/lib/auctionHouse/reagentDemand";
import type { AuctionPrice } from "@/games/wow-forever/types/auctionPrice";
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

// The price-only tests leave crafting out, so the tooltip shows just the price lines.
const NO_CRAFTING = new Map();
const DATA = addonPriceLua(HOUSES, NO_CRAFTING);
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
    const files = unzipSync(pricesAddonZip(HOUSES, NO_CRAFTING));
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

  it("says to sell on the AH when the house nets clearly more than a vendor, after its cut", () => {
    // 30c less the 5% cut (1c, rounded down) nets 29c, against a vendor's 13c.
    expect(tooltip("sell[2589] = 13; hover(GameTooltip, 2589)")).toEqual([
      "Auction (Alliance) | 30c",
      "Cheapest · on sale | 25c · 8109",
      "Sell on AH | +16c over vendor",
    ]);
    expect(tooltip("sell[2589] = 13; GameTooltip.owner = { count = 20 }; hover(GameTooltip, 2589)")).toContain(
      "Sell on AH | +310c over vendor",
    );
  });

  it("says to vendor it when the house's net isn't worth the deposit risk", () => {
    expect(tooltip("sell[2589] = 27; hover(GameTooltip, 2589)")).toContain("Vendor it | AH nets 29c · vendor 27c");
    expect(tooltip("sell[2589] = 40; GameTooltip.owner = { count = 2 }; hover(GameTooltip, 2589)")).toContain(
      "Vendor it | AH nets 57c · vendor 80c",
    );
  });

  it("writes each house's cut, and says when vendors won't buy an item", () => {
    const blackwater = addonPriceLua([house("neutral", ALLIANCE_AT, [[2589, 100, 90, 10, 2, "Linen Cloth"]])], NO_CRAFTING);
    expect(blackwater).toContain("cut = 0.15,");
    expect(DATA).toContain("cut = 0.05,");
    expect(tooltip("sell[2589] = 0; hover(GameTooltip, 2589)")).toContain("Sell on AH | vendors won't buy it");
  });

  it("needs the AH to net more than 10% over the vendor, on either faction", () => {
    // Horde's 35c nets 34c: not more than 31c × 1.1, but more than 30c × 1.1.
    expect(tooltip('faction = "Horde"; sell[2589] = 31; hover(GameTooltip, 2589)')).toContain("Vendor it | AH nets 34c · vendor 31c");
    expect(tooltip('faction = "Horde"; sell[2589] = 30; hover(GameTooltip, 2589)')).toContain("Sell on AH | +4c over vendor");
  });

  it("gives no verdict from an older Data.lua that has no house cut", () => {
    const old = DATA.replace(/ {6}cut = [\d.]+,\n/g, "");
    expect(old).not.toContain("cut =");
    expect(tooltip("sell[2589] = 13; hover(GameTooltip, 2589)", old)).toEqual(["Auction (Alliance) | 30c", "Cheapest · on sale | 25c · 8109"]);
  });

  it("gives no verdict before the client knows the item's vendor price, or on the every-house view", () => {
    expect(tooltip("hover(GameTooltip, 2589)").some((l) => /Sell on AH|Vendor it/.test(l))).toBe(false);
    expect(tooltip("sell[2589] = 13; shift = true; hover(GameTooltip, 2589)").some((l) => /Sell on AH|Vendor it/.test(l))).toBe(false);
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

const CRAFTING = await loadAllCraftingData();
const LINEN_CLOTH = 2589;
const LINEN_BANDAGE = 1251;
const COARSE_THREAD = 2320;
const COPPER_ORE = 2770;

function price(itemId: number, marketValue: number, listings: number): [number, AuctionPrice] {
  return [itemId, { itemId, name: "", marketValue, minBuyout: marketValue, quantity: listings * 5, listings }];
}

const LINEN_LINK = "|cffffffff|Hitem:2589::::::::32:::::::|h[Linen Cloth]|h|r";
const PEARL_LINK = "|cff1eff00|Hitem:4611::::::::32:::::::|h[Blue Pearl]|h|r";

describe("MGA Prices in chat", () => {
  const shown = (event: string, message: string, before = "") =>
    tooltip(`${before}\ntable.insert(out, chat("${event}", "${message}"))`);

  it("writes your house's price after each item link, and leaves unpriced links alone", () => {
    expect(shown("CHAT_MSG_CHANNEL", `WTS ${LINEN_LINK} x20, ${PEARL_LINK}`)).toEqual([
      `WTS ${LINEN_LINK} |cff999999(30c)|r x20, ${PEARL_LINK}`,
    ]);
    expect(shown("CHAT_MSG_GUILD", LINEN_LINK, 'faction = "Horde"')).toEqual([`${LINEN_LINK} |cff999999(35c)|r`]);
    expect(shown("CHAT_MSG_LOOT", `You receive loot: ${LINEN_LINK}.`)[0]).toContain("(30c)");
    expect(shown("CHAT_MSG_SAY", "no links here")).toEqual(["no links here"]);
  });

  it("/mgaprices chat turns the prices after links off and on again", () => {
    expect(shown("CHAT_MSG_CHANNEL", LINEN_LINK, 'SlashCmdList.MGAPRICES("chat")')).toEqual([
      "chat: |cff33aaffMGA Prices:|r Prices after item links in chat: off.",
      LINEN_LINK,
    ]);
    const back = shown("CHAT_MSG_CHANNEL", LINEN_LINK, 'SlashCmdList.MGAPRICES("chat"); SlashCmdList.MGAPRICES(" CHAT ")');
    expect(back[back.length - 1]).toBe(`${LINEN_LINK} |cff999999(30c)|r`);
  });

  it("shows a priced tooltip while you hover an item link in a chat window", () => {
    expect(tooltip('enterLink(ChatFrame1, "item:2589::::::::32")\ntable.insert(out, tostring(GameTooltip.shown))')).toEqual([
      "Auction (Alliance) | 30c",
      "Cheapest · on sale | 25c · 8109",
      "true",
    ]);
    expect(tooltip('enterLink(ChatFrame1, "item:2589"); leaveLink(ChatFrame1)\ntable.insert(out, tostring(GameTooltip.shown))').pop()).toBe("false");
    expect(tooltip('enterLink(ChatFrame1, "player:Somebody")')).toEqual([]);
  });

  it("prices a clicked chat link even when the client fires no tooltip post-call for it, once", () => {
    expect(tooltip('ItemRefTooltip:SetHyperlink("item:2589::::::::32")')).toEqual(["Auction (Alliance) | 30c", "Cheapest · on sale | 25c · 8109"]);
    expect(tooltip('hover(ItemRefTooltip, 2589); ItemRefTooltip:SetHyperlink("item:2589")')).toHaveLength(4);
  });

  it("says why a clicked soulbound link has no price, but stays quiet on hover", () => {
    expect(tooltip('bind[4612] = 1; ItemRefTooltip:SetHyperlink("item:4612")')).toEqual(["Auction | can't be sold (binds when picked up)"]);
    expect(tooltip("bind[4612] = 1; hover(GameTooltip, 4612)")).toEqual([]);
  });
});

describe("crafting demand on materials", () => {
  const demand = reagentDemand(CRAFTING);

  it("names the leveling routes that use a material, its own recipes' too (Linen Cloth via Bolts of Linen)", () => {
    const linen = demand.get(LINEN_CLOTH);
    expect(linen?.vendor).toBe(false);
    expect(linen?.leveling).toMatch(/First Aid 1–\d+/);
    expect(linen?.leveling).toMatch(/Tailoring 1–\d+/);
    expect(linen?.recipes).toBeGreaterThan(5);
    // Ore goes into the bars Blacksmithing's route uses.
    expect(demand.get(COPPER_ORE)?.leveling).toMatch(/Blacksmithing \d+–\d+/);
  });

  it("marks materials a vendor always sells", () => {
    expect(demand.get(COARSE_THREAD)?.vendor).toBe(true);
  });

  it("finds a craft that pays after the house's cut, only on a made item with enough auctions and a clear margin", () => {
    const byId = new Map([price(LINEN_CLOTH, 30, 50), price(LINEN_BANDAGE, 200, 10)]);
    expect(craftsThatPay(CRAFTING, byId, 0.05).get(LINEN_CLOTH)).toEqual({ recipe: "Linen Bandage", profit: 160 });
    expect(craftsThatPay(CRAFTING, byId, 0.15).get(LINEN_CLOTH)).toEqual({ recipe: "Linen Bandage", profit: 140 });

    const thin = new Map([price(LINEN_CLOTH, 30, 50), price(LINEN_BANDAGE, 200, 2)]);
    expect(craftsThatPay(CRAFTING, thin, 0.05).has(LINEN_CLOTH)).toBe(false);
    const slim = new Map([price(LINEN_CLOTH, 30, 50), price(LINEN_BANDAGE, 120, 10)]);
    expect(craftsThatPay(CRAFTING, slim, 0.05).has(LINEN_CLOTH)).toBe(false);
    const unpriced = new Map([price(LINEN_BANDAGE, 200, 10)]);
    expect(craftsThatPay(CRAFTING, unpriced, 0.05).has(LINEN_CLOTH)).toBe(false);
  });

  it("never says a craft pays with a vendor-sold material", () => {
    const byId = new Map([...CRAFTING.values()].flatMap((d) => d.file.recipes).flatMap((r) => [
      ...r.reagents.map((g) => price(g.id, 1, 10)),
      ...(r.creates ? [price(r.creates.id, 1_000_000, 10)] : []),
    ]));
    expect(craftsThatPay(CRAFTING, byId, 0.05).has(COARSE_THREAD)).toBe(false);
  });
});

describe("crafting demand in the game's tooltips", () => {
  const CRAFT_HOUSES = [
    house("alliance", ALLIANCE_AT, [
      [LINEN_CLOTH, 30, 25, 900, 50, "Linen Cloth"],
      [LINEN_BANDAGE, 200, 180, 50, 10, "Linen Bandage"],
      [COARSE_THREAD, 15, 10, 40, 8, "Coarse Thread"],
    ]),
    house("horde", HORDE_AT, [[LINEN_CLOTH, 35, 30, 500, 40, "Linen Cloth"]]),
    house("neutral", null, []),
  ];
  const CRAFT_DATA = addonPriceLua(CRAFT_HOUSES, CRAFTING);

  it("writes each material's demand and each house's paying crafts into Data.lua", () => {
    expect(CRAFT_DATA).toContain(`    [${COARSE_THREAD}] = {vendor = true},`);
    expect(CRAFT_DATA).toMatch(/\[2589\] = \{leveling = "[^"]*First Aid 1–\d+[^"]*", recipes = \d+, professions = "[^"]+"\},/);
    expect(CRAFT_DATA).toContain(`        [${LINEN_CLOTH}] = {"Linen Bandage", 160},`);
  });

  it("shows the leveling routes and the craft that pays on your house, under the price", () => {
    const lines = tooltip(`hover(GameTooltip, ${LINEN_CLOTH})`, CRAFT_DATA);
    expect(lines.slice(0, 2)).toEqual(["Auction (Alliance) | 30c", "Cheapest · on sale | 25c · 900"]);
    expect(lines[2]).toMatch(/^Leveling demand \| .*First Aid 1–\d+/);
    expect(lines[3]).toBe("Crafting pays | Linen Bandage +160c");
    // Nothing pays on the Horde house: only the leveling line.
    const horde = tooltip(`faction = "Horde"; hover(GameTooltip, ${LINEN_CLOTH})`, CRAFT_DATA);
    expect(horde).toHaveLength(3);
    expect(horde[2]).toMatch(/^Leveling demand \| /);
  });

  it("says only 'sold by vendors' for vendor materials, and how many recipes use the rest", () => {
    expect(tooltip(`hover(GameTooltip, ${COARSE_THREAD})`, CRAFT_DATA).slice(2)).toEqual(["Reagent | sold by vendors"]);
    const quiet = [...reagentDemand(CRAFTING)].find(([, d]) => !d.vendor && !d.leveling && d.recipes > 1);
    expect(quiet).toBeDefined();
    const [id, d] = quiet!;
    expect(tooltip(`hover(GameTooltip, ${id})`, CRAFT_DATA)).toEqual(["Auction (Alliance) | not on sale", `Reagent | ${d.recipes} recipes (${d.professions})`]);
  });
});
