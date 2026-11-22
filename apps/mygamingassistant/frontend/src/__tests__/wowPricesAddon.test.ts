import { loadDisenchantTables } from "@/games/wow-forever/lib/auctionHouse/loadDisenchantTables";
import { describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import addonLua from "../../addon/MGAPrices/MGAPrices.lua?raw";
import addonToc from "../../addon/MGAPrices/MGAPrices.toc?raw";
import emptyData from "../../addon/MGAPrices/Data.lua?raw";
import { loadAllCraftingData } from "@/games/wow-forever/crafting/loadCraftingData";
import { addonPriceLua } from "@/games/wow-forever/lib/auctionHouse/addonPriceLua";
import { pricesAddonZip } from "@/games/wow-forever/lib/auctionHouse/pricesAddonZip";
import { craftsThatPay, mostWantedFor, reagentDemand } from "@/games/wow-forever/lib/auctionHouse/reagentDemand";
import type { AuctionPrice } from "@/games/wow-forever/types/auctionPrice";
import type { DisenchantTables } from "@/games/wow-forever/types/auctionHouse/disenchantTables";
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

describe("the reload reminder", () => {
  const TICKER = "C_Timer = { NewTicker = function(_, f) tick = f end }; ";
  const remind = (age: number) =>
    runAddonLua([
      ["Data.lua", TICKER + DATA],
      ["MGAPrices.lua", addonLua],
      ["scenario", `NOW = ${ALLIANCE_EPOCH + age}; tick(); tick()`],
    ]).filter((l) => l.includes("/reload"));

  it("says once, in chat, to /reload when the loaded prices are old enough that the updater has newer ones", () => {
    const lines = remind(2 * HOUR);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("updated 2 hours ago");
  });

  it("stays quiet while the loaded prices are fresh", () => {
    expect(remind(HOUR)).toEqual([]);
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
const CRAFTING_RECIPES = [...CRAFTING.values()].flatMap((d) => d.file.recipes);
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

  it("names each material's most valuable product on the house, even when the craft no longer pays", () => {
    const linen = (byId: Map<number, AuctionPrice>) => mostWantedFor(CRAFTING, byId).get(LINEN_CLOTH);
    const bandage = CRAFTING_RECIPES.find((r) => r.name === "Linen Bandage")!;
    const perCraft = bandage.reagents.find((g) => g.id === LINEN_CLOTH)!.count;
    // Linen Cloth costs nearly what the bandage sells for: no craft pays, but the bandage still wants it.
    const dear = new Map([price(LINEN_CLOTH, 190, 50), price(LINEN_BANDAGE, 200, 10)]);
    expect(craftsThatPay(CRAFTING, dear, 0.05).has(LINEN_CLOTH)).toBe(false);
    expect(linen(dear)).toEqual({ recipe: "Linen Bandage", count: perCraft, sells: 200 * bandage.creates!.count });
    // A product with too few auctions says nothing about demand.
    expect(linen(new Map([price(LINEN_BANDAGE, 200, 2)]))).toBeUndefined();
    // The priciest product wins.
    const pricier = CRAFTING_RECIPES.find((r) => r.creates && !r.enchant && r.creates.id !== LINEN_BANDAGE && r.reagents.some((g) => g.id === LINEN_CLOTH))!;
    const both = new Map([price(LINEN_BANDAGE, 200, 10), price(pricier.creates!.id, 50_000, 10)]);
    expect(linen(both)?.recipe).toBe(pricier.name);
    // A product worth no more than the material it uses doesn't explain the price.
    const cheaper = new Map([price(LINEN_CLOTH, 200 / perCraft, 50), price(LINEN_BANDAGE, 200, 10)]);
    expect(linen(cheaper)).toBeUndefined();
    // A material not on sale on the house still names what it's wanted for.
    expect(linen(new Map([price(LINEN_BANDAGE, 200, 10)]))?.recipe).toBe("Linen Bandage");
    // A craft that makes several sells for all of them.
    const demand = reagentDemand(CRAFTING);
    const batch = CRAFTING_RECIPES.find((r) => r.creates && r.creates.count > 1 && !r.enchant && r.reagents.some((g) => !demand.get(g.id)?.vendor))!;
    const batchReagent = batch.reagents.find((g) => !demand.get(g.id)?.vendor)!;
    const batchWant = mostWantedFor(CRAFTING, new Map([price(batch.creates!.id, 100, 10)])).get(batchReagent.id);
    expect(batchWant).toEqual({ recipe: batch.name, count: batchReagent.count, sells: 100 * batch.creates!.count });
    // Vendor-sold materials don't need explaining.
    const all = new Map(CRAFTING_RECIPES.flatMap((r) => (r.creates ? [price(r.creates.id, 1_000, 10)] : [])));
    expect(mostWantedFor(CRAFTING, all).has(COARSE_THREAD)).toBe(false);
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

  it("says what a dear material is wanted for when no craft pays, and skips it when that's the craft that pays", () => {
    const dear = addonPriceLua(
      [
        house("alliance", ALLIANCE_AT, [
          [LINEN_CLOTH, 190, 180, 900, 50, "Linen Cloth"],
          [LINEN_BANDAGE, 200, 180, 50, 10, "Linen Bandage"],
        ]),
        house("horde", HORDE_AT, []),
        house("neutral", null, []),
      ],
      CRAFTING,
    );
    expect(dear).toMatch(/\[2589\] = \{"Linen Bandage", \d+, \d+\},/);
    const lines = tooltip(`hover(GameTooltip, ${LINEN_CLOTH})`, dear);
    expect(lines.some((l) => l.startsWith("Crafting pays"))).toBe(false);
    expect(lines[lines.length - 1]).toBe("Wanted for | Linen Bandage x1 · sells 200c");
    // When the bandage pays, "Crafting pays" already says it.
    expect(tooltip(`hover(GameTooltip, ${LINEN_CLOTH})`, CRAFT_DATA).some((l) => l.startsWith("Wanted for"))).toBe(false);
  });

  it("says only 'sold by vendors' for vendor materials, and how many recipes use the rest", () => {
    expect(tooltip(`hover(GameTooltip, ${COARSE_THREAD})`, CRAFT_DATA).slice(2)).toEqual(["Reagent | sold by vendors"]);
    const quiet = [...reagentDemand(CRAFTING)].find(([, d]) => !d.vendor && !d.leveling && d.recipes > 1);
    expect(quiet).toBeDefined();
    const [id, d] = quiet!;
    expect(tooltip(`hover(GameTooltip, ${id})`, CRAFT_DATA)).toEqual(["Auction (Alliance) | not on sale", `Reagent | ${d.recipes} recipes (${d.professions})`]);
  });
});

describe("disenchant verdict", () => {
  // Result materials: 11083 and 11082 are priced on the alliance house; 11084 is not (partial EV).
  const SOUL_DUST = 11083;
  const STRANGE_DUST = 11082;
  // Disenchantable items: 5101 requires Enchanting skill 25; 5102 requires skill 0.
  const DE_ITEM = 5101;
  const DE_ITEM_FREE = 5102;

  const DE_TABLES: DisenchantTables = {
    items: { "5101": [4, 25], "5102": [4, 0], "5103": [5, 0] },
    estimated: new Set(["5103"]),
    tables: {
      "4": {
        "11083": [1, 2, 75], // 75% chance, avg 1.5 dust
        "11082": [1, 1, 20], // 20% chance, avg 1 dust
        "11084": [1, 1, 5],  // 5% chance — no AH price in test → partial EV
      },
      "5": { "11083": [1, 2, 75], "11082": [1, 1, 20] }, // every material priced
    },
  };

  // EV per item = 0.75×1.5×(200−10) + 0.20×1.0×(100−5) = 213.75 + 19 = 232.75 → floor 232c
  const DE_EV = 232;

  const DE_HOUSES = [
    house("alliance", ALLIANCE_AT, [
      [DE_ITEM, 100, 90, 50, 5, "DE Item"],
      [SOUL_DUST, 200, 180, 100, 20, "Soul Dust"],
      [STRANGE_DUST, 100, 90, 200, 30, "Strange Dust"],
      // 11084 intentionally absent → partial EV, ~ prefix
    ]),
    house("horde", HORDE_AT, []),
    house("neutral", null, []),
  ];
  const DE_DATA = addonPriceLua(DE_HOUSES, NO_CRAFTING, DE_TABLES);

  function deTooltip(scenario: string, data = DE_DATA): string[] {
    return runAddonLua([
      ["Data.lua", data],
      ["MGAPrices.lua", addonLua],
      ["scenario", `NOW = ${ALLIANCE_EPOCH + 2 * HOUR}\n${scenario}`],
    ]);
  }

  /** The verdict lines, without the indented material list under them. */
  function verdictOnly(lines: string[]): string[] {
    return lines.filter((l) => !l.startsWith("  "));
  }

  it("writes deItems and deTables into Data.lua, omitting them without disenchant data", () => {
    expect(DE_DATA).toContain("  deItems = {");
    expect(DE_DATA).toContain("    [5101] = {4, 25},");
    expect(DE_DATA).toContain("    [5102] = {4, 0},");
    expect(DE_DATA).toContain("    [5103] = {5, 0, true},");
    expect(DE_DATA).toContain("  deTables = {");
    expect(DE_DATA).toContain("    [4] = {");
    expect(DE_DATA).toContain("      [11082] = {1, 1, 20},");
    expect(DE_DATA).toContain("      [11083] = {1, 2, 75},");
    expect(DE_DATA).toContain("      [11084] = {1, 1, 5},");
    // Without disenchant param, no DE sections.
    expect(addonPriceLua(DE_HOUSES, NO_CRAFTING)).not.toContain("deItems");
  });

  it("recommends disenchanting when it nets more than the AH and vendor, using ~ when some material prices are missing", () => {
    // DE EV 232c beats ahNets 95c and vendor 20c by more than 10%.
    const lines = deTooltip(`sell[${DE_ITEM}] = 20; enchSkill = 25; hover(GameTooltip, ${DE_ITEM})`);
    expect(lines).toContain(`Disenchant | ~${DE_EV}c`);
    expect(lines.some((l) => /Sell on AH|Vendor it/.test(l))).toBe(false);
  });

  it("lists the materials disenchanting gives, most likely first, with each one's price", () => {
    const lines = deTooltip(`sell[${DE_ITEM}] = 20; enchSkill = 25; hover(GameTooltip, ${DE_ITEM})`);
    const materials = lines.filter((l) => l.startsWith("  "));
    expect(materials).toEqual([
      "  1-2 Soul Dust · 75% | 200c each",
      "  1 Strange Dust · 20% | 100c each",
      // No price list names it, so the name comes from the client's item cache (the test client calls every item "x").
      "  1 x · 5% | not on sale",
    ]);
    expect(DE_DATA).toContain('    [11083] = "Soul Dust",');
  });

  it("lists the materials for a player without Enchanting too", () => {
    const lines = deTooltip(`sell[${DE_ITEM}] = 20; hover(GameTooltip, ${DE_ITEM})`);
    expect(lines).toContain("  1-2 Soul Dust · 75% | 200c each");
  });

  it("falls back to AH vs vendor when AH nets more than 10% over both vendor and disenchanting", () => {
    // Market 5000c: ahNets 4750c easily beats deEV 232c.
    const highHouses = [
      house("alliance", ALLIANCE_AT, [
        [DE_ITEM, 5000, 4500, 10, 2, "DE Item"],
        [SOUL_DUST, 200, 180, 100, 20, "Soul Dust"],
        [STRANGE_DUST, 100, 90, 200, 30, "Strange Dust"],
      ]),
      house("horde", HORDE_AT, []),
      house("neutral", null, []),
    ];
    const highData = addonPriceLua(highHouses, NO_CRAFTING, DE_TABLES);
    const lines = deTooltip(`sell[${DE_ITEM}] = 20; enchSkill = 25; hover(GameTooltip, ${DE_ITEM})`, highData);
    // 5000 − 250 (5% cut) = 4750 net; 4750 − 20 vendor = 4730 over vendor.
    expect(lines).toContain("Sell on AH | +4730c over vendor");
    // Disenchanting lost, but its value still shows so it can be compared.
    expect(lines.some((l) => /^Disenchant \| ~?\d+c \(less\)$/.test(l))).toBe(true);
  });

  it("finds Enchanting under a collapsed Professions header, and leaves the header collapsed", () => {
    const lines = deTooltip(
      `sell[${DE_ITEM}] = 20; enchSkill = 25; professionsCollapsed = true; hover(GameTooltip, ${DE_ITEM}); table.insert(out, "collapsed " .. tostring(professionsCollapsed))`,
    );
    expect(lines).toContain(`Disenchant | ~${DE_EV}c`);
    expect(lines).toContain("collapsed true");
  });

  it("finds Enchanting through the professions API when the client has no skills-window functions", () => {
    const lines = deTooltip(
      `sell[${DE_ITEM}] = 20; GetNumSkillLines = nil; GetSkillLineInfo = nil; ` +
        `GetProfessions = function() return 3, nil end; GetProfessionInfo = function(i) if i == 3 then return "Enchanting", 0, 25, 75, 0, 0, 333 end end; ` +
        `hover(GameTooltip, ${DE_ITEM})`,
    );
    expect(lines).toContain(`Disenchant | ~${DE_EV}c`);
    expect(lines.join(" ")).not.toContain("need");
  });

  it("treats a player who knows Disenchant as an enchanter when no API gives the rank", () => {
    const lines = deTooltip(
      `sell[${DE_ITEM}] = 20; GetNumSkillLines = nil; GetSkillLineInfo = nil; IsPlayerSpell = function(id) return id == 13262 end; hover(GameTooltip, ${DE_ITEM})`,
    );
    expect(lines).toContain(`Disenchant | ~${DE_EV}c`);
  });

  it("shows the AH or vendor verdict and a 'need Enchanting' info line when the player has no Enchanting", () => {
    // enchSkill defaults to nil (no Enchanting).
    const lines = deTooltip(`sell[${DE_ITEM}] = 20; hover(GameTooltip, ${DE_ITEM})`);
    expect(lines).toContain("Sell on AH | +75c over vendor"); // ahNets 95 − vendor 20 = 75
    expect(lines).toContain("Disenchant | need Enchanting");
  });

  it("shows the AH or vendor verdict and a 'need N Enchanting' info line when the player's skill is too low", () => {
    // DE_ITEM requires skill 25; player has 10.
    const lines = deTooltip(`sell[${DE_ITEM}] = 20; enchSkill = 10; hover(GameTooltip, ${DE_ITEM})`);
    expect(lines).toContain("Sell on AH | +75c over vendor");
    expect(lines).toContain("Disenchant | need 25 Enchanting");
  });

  it("shows the disenchant verdict for a bind-on-pickup item a player with Enchanting can DE", () => {
    // BoP: no AH option. Only disenchant vs vendor — DE wins here.
    const lines = deTooltip(`sell[${DE_ITEM_FREE}] = 20; bind[${DE_ITEM_FREE}] = 1; enchSkill = 1; hover(GameTooltip, ${DE_ITEM_FREE})`);
    expect(verdictOnly(lines)).toEqual([`Disenchant | ~${DE_EV}c`]);
  });

  it("marks an item Forever added with ~ even when every material is priced: its table is an estimate", () => {
    const lines = deTooltip(`sell[5103] = 20; bind[5103] = 1; enchSkill = 1; hover(GameTooltip, 5103)`);
    expect(verdictOnly(lines)).toEqual([`Disenchant | ~${DE_EV}c`]);
    const classic = addonPriceLua(DE_HOUSES, NO_CRAFTING, { ...DE_TABLES, items: { "5103": [5, 0] }, estimated: new Set() });
    expect(verdictOnly(deTooltip(`sell[5103] = 20; bind[5103] = 1; enchSkill = 1; hover(GameTooltip, 5103)`, classic))).toEqual([`Disenchant | ${DE_EV}c`]);
  });

  it("the bundled tables give gear Forever added Classic's table for its quality, level and type, marked estimated", () => {
    const de = loadDisenchantTables();
    // White Obsidian Wand: a rare level 44 wand Forever added — Classic's rare level 41-46 table.
    expect(de.items["274425"]).toEqual([45, 0]);
    expect(de.estimated.has("274425")).toBe(true);
    // A Classic item keeps its own table and isn't an estimate.
    expect(de.items["647"]).toEqual([64, 0]);
    expect(de.estimated.has("647")).toBe(false);
  });

  it("shows vendor vs disenchant for a BoP item when the player has no Enchanting", () => {
    const lines = deTooltip(`sell[${DE_ITEM_FREE}] = 20; bind[${DE_ITEM_FREE}] = 1; hover(GameTooltip, ${DE_ITEM_FREE})`);
    expect(verdictOnly(lines)).toEqual(["Vendor it | vendor 20c", "Disenchant | need Enchanting"]);
  });
});

// ── Quest item AH display ─────────────────────────────────────────────────────

const QUEST_ID = 10;
const QUEST_ITEM_A = 1260; // quest item on sale at alliance AH
const QUEST_ITEM_B = 2589; // second item also on sale
const QUEST_ITEMS_MAP = new Map<number, readonly { itemId: number; count: number }[]>([
  [QUEST_ID, [
    { itemId: QUEST_ITEM_A, count: 1 },
    { itemId: QUEST_ITEM_B, count: 5 },
  ]],
  [99, [{ itemId: 9999, count: 3 }]], // item 9999 not in any house → filtered out
]);
const QUEST_HOUSES = [
  house("alliance", ALLIANCE_AT, [
    [QUEST_ITEM_A, 200, 100, 20, 5, "Worn Mace"],
    [QUEST_ITEM_B, 30, 25, 8109, 358, "Linen Cloth"],
  ]),
  house("horde", HORDE_AT, [[QUEST_ITEM_A, 150, 90, 10, 3, "Worn Mace"]]),
  house("neutral", null, []),
];
const QUEST_DATA = addonPriceLua(QUEST_HOUSES, NO_CRAFTING, undefined, QUEST_ITEMS_MAP);

function qTooltip(scenario: string, data = QUEST_DATA): string[] {
  return runAddonLua([
    ["Data.lua", data],
    ["MGAPrices.lua", addonLua],
    ["scenario", `NOW = ${ALLIANCE_EPOCH + 2 * HOUR}\n${scenario}`],
  ]);
}

describe("addonPriceLua questItems section", () => {
  it("writes questItems section with on-sale objectives, ordered by quest id, skipping quests with no on-sale items", () => {
    // Quest 10 has items 1260 and 2589, both on sale in alliance house.
    expect(QUEST_DATA).toContain(`    [${QUEST_ID}] = {{${QUEST_ITEM_A}, 1}, {${QUEST_ITEM_B}, 5}},`);
    // Quest 99 has item 9999 which is not in any house → omitted.
    expect(QUEST_DATA).not.toContain("[99]");
    // Quests with no on-sale items → section still present (quest 10 is in it).
    expect(QUEST_DATA).toContain("  questItems = {");
  });

  it("omits the questItems section entirely when no quests have on-sale items", () => {
    const noSale = addonPriceLua(QUEST_HOUSES, NO_CRAFTING, undefined, new Map([[QUEST_ID, [{ itemId: 9999, count: 1 }]]]));
    expect(noSale).not.toContain("questItems");
  });

  it("omits the questItems section when questItems is not provided", () => {
    expect(addonPriceLua(QUEST_HOUSES, NO_CRAFTING)).not.toContain("questItems");
  });
});

describe("quest log AH block", () => {
  it("shows items on sale for the selected quest in the quest log", () => {
    const lines = qTooltip(`triggerQuestLog(${QUEST_ID})`);
    // The stub's getItemInfo returns "x" for all items.
    expect(lines.some((l) => l.startsWith("qlog: |cff33aaff[MGA]|r"))).toBe(true);
    expect(lines.some((l) => l.includes("needs 1"))).toBe(true);
    expect(lines.some((l) => l.includes("20 listed"))).toBe(true);
    expect(lines.some((l) => l.includes("cheapest 100c"))).toBe(true);
  });

  it("shows nothing when the quest has no items on sale", () => {
    // Quest 55 has no entry in questItems → no qlog: lines.
    const lines = qTooltip(`triggerQuestLog(55)`);
    expect(lines.filter((l) => l.startsWith("qlog:"))).toHaveLength(0);
  });

  it("clears the block when switching to a quest with no items on sale", () => {
    // Trigger quest 10 (has items), then quest 55 (no items) → no extra qlog: lines.
    const withItems = qTooltip(`triggerQuestLog(${QUEST_ID})`).filter((l) => l.startsWith("qlog:"));
    const afterSwitch = qTooltip(`triggerQuestLog(${QUEST_ID})\ntriggerQuestLog(55)`).filter((l) => l.startsWith("qlog:"));
    // Second trigger produces no additional qlog: output — same set as first trigger only.
    expect(afterSwitch).toEqual(withItems);
  });
});

describe("quest giver detail AH block (QUEST_DETAIL event)", () => {
  it("shows items on sale when the QUEST_DETAIL event fires", () => {
    const lines = qTooltip(`triggerQuestDetail(${QUEST_ID})`);
    expect(lines.some((l) => l.startsWith("qdetail: |cff33aaff[MGA]|r"))).toBe(true);
    expect(lines.some((l) => l.includes("needs 1"))).toBe(true);
    expect(lines.some((l) => l.includes("cheapest 100c"))).toBe(true);
  });

  it("shows nothing for a quest with no items on sale at the quest giver", () => {
    const lines = qTooltip(`triggerQuestDetail(55)`);
    expect(lines.filter((l) => l.startsWith("qdetail:"))).toHaveLength(0);
  });
});
