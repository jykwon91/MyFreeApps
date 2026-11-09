/**
 * GET /api/wow/prices answering "no prices yet", for specs whose pages show prices but don't test them.
 * Priced flows stub real rows in wow-forever-auction-prices.spec.ts.
 */
import type { Page } from "@playwright/test";

/** The shape the backend serves before its first Blizzard refresh, for whichever faction is asked for. */
export async function stubEmptyPrices(page: Page): Promise<void> {
  await page.route("**/wow/prices**", (route) => {
    const faction = new URL(route.request().url()).searchParams.get("faction") ?? "alliance";
    return route.fulfill({
      json: {
        region: "us",
        faction,
        source_updated_at: null,
        fetched_at: null,
        columns: ["item_id", "market_value", "min_buyout", "quantity", "listings", "name"],
        items: [],
      },
    });
  });
}
