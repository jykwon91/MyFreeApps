/**
 * WoW Forever auction-house prices API — GET /api/wow/prices against a real backend.
 *
 * The prices are filled by the backend's scheduled refresh (or
 * `python -m app.cli refresh-wow-prices`), never by a user, so this suite is
 * read-only: it checks the public contract the pages rely on — the TSM credit,
 * the columnar rows, the ETag round trip and that it is US only. The page flows
 * that use these prices stub this endpoint in their own specs.
 *
 * Prereqs: backend on BACKEND_URL (default :8004) with fixtures loaded. Rows
 * are checked when a refresh has run; with none yet the list is empty.
 */
import { test, expect } from "@playwright/test";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8004";
const PRICES_URL = `${BACKEND_URL}/api/wow/prices`;
const COLUMNS = ["item_id", "market_value", "avg_sale_price", "historical", "sold_per_day", "name"];

test.describe("WoW Forever prices API", () => {
  test.beforeEach(async ({ request }) => {
    const health = await request.get(`${BACKEND_URL}/health`).catch(() => null);
    test.skip(!health?.ok(), `backend not reachable at ${BACKEND_URL}`);
  });

  test("serves the US prices with the credit, then a 304 for the same set", async ({ request }) => {
    const resp = await request.get(PRICES_URL);
    expect(resp.status()).toBe(200);
    expect(resp.headers()["cache-control"]).toBe("public, max-age=600");

    const body = await resp.json();
    expect(body.region).toBe("us");
    expect(body.credit).toEqual({
      source: "tsm",
      name: "TradeSkillMaster",
      url: "https://www.tradeskillmaster.com",
    });
    expect(body.columns).toEqual(COLUMNS);
    expect(Array.isArray(body.items)).toBe(true);
    for (const row of body.items.slice(0, 50)) {
      expect(row).toHaveLength(COLUMNS.length);
      expect(Number.isInteger(row[0]) && row[0] > 0).toBe(true);
      expect(Number.isInteger(row[1]) && row[1] >= 0).toBe(true);
      expect(typeof row[5]).toBe("string");
    }
    if (body.items.length > 0) {
      expect(body.fetched_at).not.toBeNull();
      expect(body.source_updated_at).not.toBeNull();
    }

    const etag = resp.headers()["etag"];
    expect(etag).toBeTruthy();
    const again = await request.get(PRICES_URL, {
      headers: { "If-None-Match": etag },
    });
    expect(again.status()).toBe(304);
  });

  test("is US only: an old ?region= link still gets the US prices", async ({ request }) => {
    for (const region of ["eu", "kr", "cn"]) {
      const resp = await request.get(PRICES_URL, { params: { region } });
      expect(resp.status()).toBe(200);
      const body = await resp.json();
      expect(body.region).toBe("us");
      expect(body.credit.name).toBe("TradeSkillMaster");
    }
  });
});
