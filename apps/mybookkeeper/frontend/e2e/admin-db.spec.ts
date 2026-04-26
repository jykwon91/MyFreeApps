import { test, expect } from "@playwright/test";

const BASE = process.env.BASE_URL ?? "http://localhost:8000";

test.describe("Admin DB endpoints", () => {
  test("rejects unauthenticated query request", async ({ request }) => {
    const res = await request.post(`${BASE}/api/admin/db/query`, {
      data: { sql: "SELECT 1" },
    });
    expect(res.status()).toBe(401);
  });

  test("rejects unauthenticated reassign-property request", async ({ request }) => {
    const res = await request.post(`${BASE}/api/admin/db/reassign-property`, {
      data: { organization_id: "00000000-0000-0000-0000-000000000000", vendor: "Test", filename_pattern: "test", target_property_id: "00000000-0000-0000-0000-000000000000" },
    });
    expect(res.status()).toBe(401);
  });

  test("rejects unauthenticated soft-delete request", async ({ request }) => {
    const res = await request.post(`${BASE}/api/admin/db/soft-delete`, {
      data: { organization_id: "00000000-0000-0000-0000-000000000000", vendor: "Test" },
    });
    expect(res.status()).toBe(401);
  });

  test("rejects unauthenticated re-extract request", async ({ request }) => {
    const res = await request.post(`${BASE}/api/admin/db/re-extract`, {
      data: { organization_id: "00000000-0000-0000-0000-000000000000", document_ids: [] },
    });
    expect(res.status()).toBe(401);
  });
});
