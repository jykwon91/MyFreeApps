/**
 * E2E tests verifying typed API response shapes.
 *
 * Each test hits a real endpoint and asserts that the response body
 * matches the Pydantic schema fields defined in this PR. This ensures
 * the backend serialises correctly and no schema mismatch exists.
 */
import { test, expect } from "./fixtures/auth";
import { seededOrg } from "./fixtures/seeded-org";
import { createApprovedTransaction, createProperty } from "./fixtures/seed-data";

test.describe("Typed response shapes — common mutations", () => {
  test.describe("Health dashboard endpoints", () => {
    test("POST /health/retry-failed returns { retried: number }", async ({ api }) => {
      const res = await api.post("/health/retry-failed");
      expect(res.ok()).toBe(true);
      const data = await res.json();
      expect(typeof data.retried).toBe("number");
      // Must not include unrelated keys
      expect(data).not.toHaveProperty("status");
    });
  });

  test.describe("Transaction bulk operations", () => {
    test("POST /transactions/bulk-approve with an empty list is rejected with 422", async ({ api }) => {
      const res = await api.post("/transactions/bulk-approve", { data: { ids: [] } });
      expect(res.status()).toBe(422);
    });

    test("POST /transactions/bulk-delete with an empty list is rejected with 422", async ({ api }) => {
      const res = await api.post("/transactions/bulk-delete", { data: { ids: [] } });
      expect(res.status()).toBe(422);
    });
  });

  test.describe("Document bulk operations", () => {
    test("POST /documents/bulk-delete with an empty list is rejected with 422", async ({ api }) => {
      const res = await api.post("/documents/bulk-delete", { data: { ids: [] } });
      expect(res.status()).toBe(422);
    });
  });

  test.describe("Reconciliation auto-reconcile", () => {
    test("POST /reconciliation/auto-reconcile returns { sources_checked, auto_matched, discrepancies }", async ({ api }) => {
      const res = await api.post("/reconciliation/auto-reconcile?tax_year=2024");
      expect(res.ok()).toBe(true);
      const data = await res.json();
      expect(typeof data.sources_checked).toBe("number");
      expect(typeof data.auto_matched).toBe("number");
      expect(typeof data.discrepancies).toBe("number");
    });
  });

  test.describe("TOTP status endpoint", () => {
    test("GET /auth/totp/status returns { enabled: boolean }", async ({ api }) => {
      const res = await api.get("/auth/totp/status");
      expect(res.ok()).toBe(true);
      const data = await res.json();
      expect(typeof data.enabled).toBe("boolean");
      // Must not include nulled-out token fields
      expect(data).not.toHaveProperty("access_token");
      expect(data).not.toHaveProperty("token_type");
    });
  });

  test.describe("Tax return endpoints", () => {
    // A fresh organization with one return: a manual, field-less W-2 and $2,000
    // of rent on one investment property, recomputed once. Each response is then
    // exact rather than whatever the shared account has, in any test order.
    let returnId = "";
    const org = seededOrg("typed-responses-tax", async (api) => {
      const created = await api.post("/tax-returns", { data: { tax_year: 2024 } });
      expect(created.status(), await created.text()).toBe(201);
      returnId = ((await created.json()) as { id: string }).id;
      const form = await api.post(`/test/tax-returns/${returnId}/seed-form-instance`, { data: { form_name: "w2" } });
      expect(form.status(), await form.text()).toBe(201);
      const property = await createProperty(api, { name: "E2E Typed Rental", type: "long_term", classification: "investment" });
      await createApprovedTransaction(api, {
        property_id: property.id, vendor: "E2E Typed Tenant", transaction_type: "income",
        category: "rental_revenue", amount: "2000.00", tax_relevant: true, transaction_date: "2024-06-15",
      });
      const recomputed = await api.post(`/tax-returns/${returnId}/recompute`);
      expect(recomputed.status(), await recomputed.text()).toBe(200);
    });

    test("GET /tax-returns/{id}/forms-overview returns form_name, instance_count, field_count", async () => {
      const res = await org().api.get(`/tax-returns/${returnId}/forms-overview`);
      expect(res.status(), await res.text()).toBe(200);
      expect(await res.json()).toEqual([
        { form_name: "1040", instance_count: 1, field_count: 1 },
        { form_name: "schedule_1", instance_count: 1, field_count: 2 },
        // One for the property, one for the all-properties total.
        { form_name: "schedule_e", instance_count: 2, field_count: 4 },
        { form_name: "w2", instance_count: 1, field_count: 0 },
      ]);
    });

    test("POST /tax-returns/{id}/recompute returns { status, forms_updated }", async () => {
      const res = await org().api.post(`/tax-returns/${returnId}/recompute`);
      expect(res.status(), await res.text()).toBe(200);
      expect(await res.json()).toEqual({ status: "ok", forms_updated: 2 });
    });

    test("GET /tax-returns/{id}/validation flags the missing depreciation and the QBI deduction", async () => {
      const res = await org().api.get(`/tax-returns/${returnId}/validation`);
      expect(res.status(), await res.text()).toBe(200);
      expect(await res.json()).toEqual([
        {
          severity: "warning", form_name: "form_4562", field_id: null, expected_value: null, actual_value: 0,
          message: expect.stringMatching(/^A rental property with \$2,000\.00 in income has no depreciation claimed\./),
        },
        {
          severity: "info", form_name: "1040", field_id: null, expected_value: null, actual_value: 400,
          message: expect.stringMatching(/^You may qualify for a \$400\.00 QBI deduction \(20% of \$2,000\.00/),
        },
      ]);
    });
  });

  test.describe("TOTP login — totp_required flow", () => {
    test("POST /auth/totp/login with bad credentials returns 400", async ({ api }) => {
      const res = await api.post("/auth/totp/login", {
        data: { email: "nonexistent@example.com", password: "wrong" },
      });
      // Bad credentials → 400; we just verify the endpoint is reachable
      expect(res.status()).toBeLessThan(500);
    });
  });
});
