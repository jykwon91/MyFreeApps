/**
 * WoW Forever auction-house prices API — GET /api/wow/prices against a real backend.
 *
 * The prices are filled by the backend's scheduled Blizzard refresh (or
 * `python -m app.cli refresh-wow-prices`), never by a user, so this suite is
 * read-only: it checks the public contract the pages rely on — one price list
 * per auction house (a mapped server's house for one faction; the PvP server's
 * Alliance house by default — houses are never pooled), the columnar rows, the
 * ETag round trip, that an unmapped server is refused and that it is US only.
 * The page flows that use these prices stub this endpoint in their own specs.
 *
 * Prereqs: backend on BACKEND_URL (default :8004) with fixtures loaded. Rows
 * are checked when a refresh has run; with none yet the list is empty.
 */
import { test, expect } from "@playwright/test";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8004";
const PRICES_URL = `${BACKEND_URL}/api/wow/prices`;
const COLUMNS = ["item_id", "market_value", "min_buyout", "quantity", "listings", "name"];
const FACTIONS = ["alliance", "horde", "neutral"];

test.describe("WoW Forever prices API", () => {
  test.beforeEach(async ({ request }) => {
    const health = await request.get(`${BACKEND_URL}/health`).catch(() => null);
    test.skip(!health?.ok(), `backend not reachable at ${BACKEND_URL}`);
  });

  test("serves the PvP server's Alliance house by default, then a 304 for the same set", async ({ request }) => {
    const resp = await request.get(PRICES_URL);
    expect(resp.status()).toBe(200);
    expect(resp.headers()["cache-control"]).toBe("public, max-age=600");

    const body = await resp.json();
    expect(body.region).toBe("us");
    expect(body.server).toBe("pvp");
    expect(body.faction).toBe("alliance");
    expect(body).not.toHaveProperty("credit");
    expect(body.columns).toEqual(COLUMNS);
    expect(Array.isArray(body.items)).toBe(true);
    for (const row of body.items.slice(0, 50)) {
      expect(row).toHaveLength(COLUMNS.length);
      const [itemId, marketValue, minBuyout, quantity, listings, name] = row;
      expect(Number.isInteger(itemId) && itemId > 0).toBe(true);
      expect(Number.isInteger(minBuyout) && minBuyout > 0).toBe(true);
      // The market value is never below the cheapest listing.
      expect(Number.isInteger(marketValue) && marketValue >= minBuyout).toBe(true);
      expect(Number.isInteger(listings) && listings > 0).toBe(true);
      expect(Number.isInteger(quantity) && quantity >= listings).toBe(true);
      expect(typeof name).toBe("string");
    }
    if (body.items.length > 0) {
      expect(body.fetched_at).not.toBeNull();
      expect(body.source_updated_at).not.toBeNull();
    }

    const etag = resp.headers()["etag"];
    expect(etag).toBeTruthy();
    const again = await request.get(PRICES_URL, { headers: { "If-None-Match": etag } });
    expect(again.status()).toBe(304);
  });

  test("each of the PvP server's houses has its own price list, with its own ETag", async ({ request }) => {
    const etags = new Set<string>();
    for (const faction of FACTIONS) {
      const resp = await request.get(PRICES_URL, { params: { server: "pvp", faction } });
      expect(resp.status()).toBe(200);
      const body = await resp.json();
      expect(body.server).toBe("pvp");
      expect(body.faction).toBe(faction);
      expect(body.region).toBe("us");
      etags.add(resp.headers()["etag"]);
    }
    expect(etags.size).toBe(FACTIONS.length);
  });

  test("an unknown faction or an unmapped server is refused, and an old ?region= link still gets US prices", async ({ request }) => {
    expect((await request.get(PRICES_URL, { params: { faction: "pirates" } })).status()).toBe(422);
    expect((await request.get(PRICES_URL, { params: { server: "pve" } })).status()).toBe(422);
    const resp = await request.get(PRICES_URL, { params: { region: "eu" } });
    expect(resp.status()).toBe(200);
    expect((await resp.json()).region).toBe("us");
  });
});
