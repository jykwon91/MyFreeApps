import { test, expect } from "./fixtures/auth";

/**
 * PR 4.1a — Vendors backend behavioural tests.
 *
 * PR 4.1a ships the read-only Vendors API. The public POST /vendors lands
 * in PR 4.2 — until then, /test/seed-vendor (gated by
 * ALLOW_TEST_ADMIN_PROMOTION, off in production) lets the E2E suite seed
 * vendors via direct DB insert so we can exercise the full
 * create → fetch → verify → cleanup flow.
 *
 * Each test:
 *  1. seeds a Vendor (test-only seed endpoint)
 *  2. exercises the read endpoint(s) under test
 *  3. tears down the row via /test/vendors/{id}
 */

interface SeedVendorPayload {
  name?: string;
  category?: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  hourly_rate?: string | null;
  flat_rate_notes?: string | null;
  preferred?: boolean;
  notes?: string | null;
}

async function seedVendor(
  api: import("@playwright/test").APIRequestContext,
  payload: SeedVendorPayload,
): Promise<string> {
  const res = await api.post("/test/seed-vendor", { data: payload });
  if (!res.ok()) {
    throw new Error(`seedVendor failed: ${res.status()} ${await res.text()}`);
  }
  const body = (await res.json()) as { id: string };
  return body.id;
}

async function deleteVendor(
  api: import("@playwright/test").APIRequestContext,
  vendorId: string,
): Promise<void> {
  await api.delete(`/test/vendors/${vendorId}`).catch(() => {});
}

test.describe("Vendors API (read-only, PR 4.1a)", () => {
  test("seeded vendor appears in GET /vendors and matches GET /vendors/{id}", async ({ api }) => {
    let vendorId: string | null = null;
    try {
      vendorId = await seedVendor(api, {
        name: `E2E Plumber ${Date.now()}`,
        category: "plumber",
        phone: "555-0101",
        email: "e2e-plumber@example.com",
        address: "1 E2E Way",
        hourly_rate: "125.50",
        flat_rate_notes: "Flat $200 for drain unclog",
        preferred: true,
        notes: "Reliable",
      });

      // List endpoint: paginated envelope, the seeded row must appear.
      const listRes = await api.get("/vendors?limit=100");
      expect(listRes.ok()).toBe(true);
      const list = (await listRes.json()) as {
        items: Array<{
          id: string;
          name: string;
          category: string;
          preferred: boolean;
          hourly_rate: string | null;
        }>;
        total: number;
        has_more: boolean;
      };
      expect(typeof list.total).toBe("number");
      expect(typeof list.has_more).toBe("boolean");
      const found = list.items.find((row) => row.id === vendorId);
      expect(found, "seeded vendor should appear in /vendors response").toBeDefined();
      expect(found!.category).toBe("plumber");
      expect(found!.preferred).toBe(true);

      // Detail endpoint: full payload including contact info + flat-rate notes.
      const detailRes = await api.get(`/vendors/${vendorId}`);
      expect(detailRes.ok()).toBe(true);
      const detail = (await detailRes.json()) as {
        id: string;
        name: string;
        category: string;
        phone: string | null;
        email: string | null;
        address: string | null;
        hourly_rate: string | null;
        flat_rate_notes: string | null;
        preferred: boolean;
        notes: string | null;
      };
      expect(detail.id).toBe(vendorId);
      expect(detail.category).toBe("plumber");
      expect(detail.phone).toBe("555-0101");
      expect(detail.email).toBe("e2e-plumber@example.com");
      expect(detail.address).toBe("1 E2E Way");
      expect(String(detail.hourly_rate)).toBe("125.50");
      expect(detail.flat_rate_notes).toBe("Flat $200 for drain unclog");
      expect(detail.preferred).toBe(true);
      expect(detail.notes).toBe("Reliable");
    } finally {
      if (vendorId) {
        await deleteVendor(api, vendorId);
      }
    }
  });

  test("category filter excludes vendors whose category does not match", async ({ api }) => {
    const ids: string[] = [];
    try {
      const plumberId = await seedVendor(api, {
        name: `E2E Filter Plumber ${Date.now()}`,
        category: "plumber",
      });
      const electricianId = await seedVendor(api, {
        name: `E2E Filter Electrician ${Date.now()}`,
        category: "electrician",
      });
      ids.push(plumberId, electricianId);

      const plumbersRes = await api.get("/vendors?category=plumber&limit=100");
      const plumbers = (await plumbersRes.json()) as {
        items: Array<{ id: string; category: string }>;
        total: number;
        has_more: boolean;
      };
      const plumberRow = plumbers.items.find((row) => row.id === plumberId);
      const electricianHidden = plumbers.items.find((row) => row.id === electricianId);
      expect(plumberRow, "plumber visible under category=plumber").toBeDefined();
      expect(
        electricianHidden,
        "electrician hidden under category=plumber",
      ).toBeUndefined();

      const electriciansRes = await api.get("/vendors?category=electrician&limit=100");
      const electricians = (await electriciansRes.json()) as {
        items: Array<{ id: string; category: string }>;
        total: number;
        has_more: boolean;
      };
      const electricianRow = electricians.items.find((row) => row.id === electricianId);
      const plumberHidden = electricians.items.find((row) => row.id === plumberId);
      expect(
        electricianRow,
        "electrician visible under category=electrician",
      ).toBeDefined();
      expect(
        plumberHidden,
        "plumber hidden under category=electrician",
      ).toBeUndefined();
    } finally {
      for (const id of ids) {
        await deleteVendor(api, id);
      }
    }
  });

  test("GET /vendors/{nonexistent-uuid} returns 404", async ({ api }) => {
    const res = await api.get("/vendors/00000000-0000-0000-0000-000000000000");
    expect(res.status()).toBe(404);
    const body = (await res.json()) as { detail: string };
    expect(body.detail).toBe("Vendor not found");
  });
});
