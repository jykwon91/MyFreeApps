import { test, expect } from "./fixtures/auth";
import { createProperty, deleteProperty } from "./fixtures/seed-data";

/**
 * PR 1.1a — Listings backend behavioural tests.
 *
 * PR 1.1a ships the read-only Listings API. The public POST /listings lands
 * in PR 1.2 — until then, /test/seed-listing (gated by ALLOW_TEST_ADMIN_PROMOTION,
 * off in production) lets the E2E suite seed listings via direct DB insert
 * so we can exercise the full create → fetch → verify → cleanup flow.
 *
 * Each test:
 *  1. creates a Property (real API)
 *  2. seeds a Listing for that property (test-only seed endpoint)
 *  3. exercises the read endpoint(s) under test
 *  4. tears down both records
 */

interface SeedListingPayload {
  property_id: string;
  title?: string;
  monthly_rate?: string;
  room_type?: string;
  status?: string;
}

async function seedListing(
  api: import("@playwright/test").APIRequestContext,
  payload: SeedListingPayload,
): Promise<string> {
  const res = await api.post("/test/seed-listing", { data: payload });
  if (!res.ok()) {
    throw new Error(`seedListing failed: ${res.status()} ${await res.text()}`);
  }
  const body = (await res.json()) as { id: string };
  return body.id;
}

async function deleteListing(
  api: import("@playwright/test").APIRequestContext,
  listingId: string,
): Promise<void> {
  await api.delete(`/test/listings/${listingId}`).catch(() => {});
}

test.describe("Listings API (read-only, PR 1.1a)", () => {
  test("seeded listing appears in GET /listings and matches GET /listings/{id}", async ({ api }) => {
    const property = await createProperty(api, { name: `E2E Listing Property ${Date.now()}` });
    let listingId: string | null = null;
    try {
      listingId = await seedListing(api, {
        property_id: property.id as string,
        title: "E2E Listings Smoke",
        monthly_rate: "1799.00",
        room_type: "private_room",
        status: "active",
      });

      // List endpoint: the seeded row must appear.
      // Per PR 1.2 (#270), GET /listings now returns a paginated envelope:
      // { items, total, has_more } — not a flat array. Update accordingly.
      const listRes = await api.get("/listings?status=active&limit=100");
      expect(listRes.ok()).toBe(true);
      const list = (await listRes.json()) as {
        items: Array<{ id: string; title: string; status: string; monthly_rate: string }>;
        total: number;
        has_more: boolean;
      };
      expect(typeof list.total).toBe("number");
      expect(typeof list.has_more).toBe("boolean");
      const found = list.items.find((row) => row.id === listingId);
      expect(found, "seeded listing should appear in /listings response").toBeDefined();
      expect(found!.title).toBe("E2E Listings Smoke");
      expect(found!.status).toBe("active");
      expect(String(found!.monthly_rate)).toBe("1799.00");

      // Detail endpoint: full payload with property/user/org references and empty relations.
      const detailRes = await api.get(`/listings/${listingId}`);
      expect(detailRes.ok()).toBe(true);
      const detail = (await detailRes.json()) as {
        id: string;
        title: string;
        property_id: string;
        room_type: string;
        amenities: string[];
        photos: unknown[];
        external_ids: unknown[];
      };
      expect(detail.id).toBe(listingId);
      expect(detail.title).toBe("E2E Listings Smoke");
      expect(detail.property_id).toBe(property.id);
      expect(detail.room_type).toBe("private_room");
      expect(detail.amenities).toEqual([]);
      expect(detail.photos).toEqual([]);
      expect(detail.external_ids).toEqual([]);
    } finally {
      if (listingId) {
        await deleteListing(api, listingId);
      }
      await deleteProperty(api, property.id as string);
    }
  });

  test("status filter excludes listings whose status does not match", async ({ api }) => {
    const property = await createProperty(api, { name: `E2E Status Filter ${Date.now()}` });
    const ids: string[] = [];
    try {
      const activeId = await seedListing(api, {
        property_id: property.id as string,
        title: "Active Row",
        status: "active",
      });
      const archivedId = await seedListing(api, {
        property_id: property.id as string,
        title: "Archived Row",
        status: "archived",
      });
      ids.push(activeId, archivedId);

      const activesRes = await api.get("/listings?status=active&limit=100");
      const actives = (await activesRes.json()) as {
        items: Array<{ id: string; status: string }>;
        total: number;
        has_more: boolean;
      };
      const activeRow = actives.items.find((row) => row.id === activeId);
      const archivedHidden = actives.items.find((row) => row.id === archivedId);
      expect(activeRow, "active row visible under status=active").toBeDefined();
      expect(archivedHidden, "archived row hidden under status=active").toBeUndefined();

      const archivedRes = await api.get("/listings?status=archived&limit=100");
      const archived = (await archivedRes.json()) as {
        items: Array<{ id: string; status: string }>;
        total: number;
        has_more: boolean;
      };
      const archivedRow = archived.items.find((row) => row.id === archivedId);
      const activeHidden = archived.items.find((row) => row.id === activeId);
      expect(archivedRow, "archived row visible under status=archived").toBeDefined();
      expect(activeHidden, "active row hidden under status=archived").toBeUndefined();
    } finally {
      for (const id of ids) {
        await deleteListing(api, id);
      }
      await deleteProperty(api, property.id as string);
    }
  });

  test("GET /listings/{nonexistent-uuid} returns 404", async ({ api }) => {
    const res = await api.get("/listings/00000000-0000-0000-0000-000000000000");
    expect(res.status()).toBe(404);
    const body = (await res.json()) as { detail: string };
    expect(body.detail).toBe("Listing not found");
  });
});
