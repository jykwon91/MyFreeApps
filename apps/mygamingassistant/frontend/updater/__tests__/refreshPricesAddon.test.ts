import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadAllCraftingData } from "@/games/wow-forever/crafting/loadCraftingData";
import { addonPriceLua } from "@/games/wow-forever/lib/auctionHouse/addonPriceLua";
import type { PriceHouse } from "@/games/wow-forever/types/priceHouse";
import type { PriceListResponse } from "@/games/wow-forever/types/priceListResponse";
import { refreshPricesAddon } from "../refreshPricesAddon";

const COLUMNS = ["item_id", "market_value", "min_buyout", "quantity", "listings", "name"];
const UPDATED = "2026-11-11T14:00:00Z";

function fakeHouse(house: PriceHouse): Promise<PriceListResponse> {
  const linen = house.faction === "horde" ? 35 : 30;
  return Promise.resolve({
    region: "us", server: house.server, faction: house.faction,
    source_updated_at: UPDATED, fetched_at: UPDATED, columns: COLUMNS,
    items: [[2589, linen, linen, 100, 10, "Linen Cloth"]],
  });
}

describe("the MGA Prices updater", () => {
  let addons: string;

  beforeEach(async () => {
    addons = await mkdtemp(path.join(tmpdir(), "mga-addons-"));
  });
  afterEach(async () => {
    await rm(addons, { recursive: true, force: true });
  });

  it("rewrites Data.lua with every house's current prices, the same file the site's download builds", async () => {
    await mkdir(path.join(addons, "MGAPrices"));
    await writeFile(path.join(addons, "MGAPrices", "Data.lua"), "-- old prices");
    await writeFile(path.join(addons, "MGAPrices", "MGAPrices.lua"), "-- addon code");

    const written = await refreshPricesAddon(addons, fakeHouse);

    const houses = await Promise.all((["alliance", "horde", "neutral"] as const).map((faction) => fakeHouse({ server: "pvp", faction })));
    expect(written).toBe(path.join(addons, "MGAPrices", "Data.lua"));
    expect(await readFile(written, "utf8")).toBe(addonPriceLua(houses, await loadAllCraftingData()));
    expect(await readFile(path.join(addons, "MGAPrices", "MGAPrices.lua"), "utf8")).toBe("-- addon code");
    expect((await readdir(path.join(addons, "MGAPrices"))).sort()).toEqual(["Data.lua", "MGAPrices.lua"]);
  });

  it("fails without writing anything when the addon isn't installed", async () => {
    await expect(refreshPricesAddon(addons, fakeHouse)).rejects.toThrow("MGA Prices isn't installed");
    expect(await readdir(addons)).toEqual([]);
  });

  it("leaves the old prices alone when the API fails", async () => {
    await mkdir(path.join(addons, "MGAPrices"));
    await writeFile(path.join(addons, "MGAPrices", "Data.lua"), "-- old prices");

    await expect(refreshPricesAddon(addons, () => Promise.reject(new Error("503")))).rejects.toThrow("503");
    expect(await readFile(path.join(addons, "MGAPrices", "Data.lua"), "utf8")).toBe("-- old prices");
  });
});
