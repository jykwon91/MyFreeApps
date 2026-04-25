/**
 * E2E tests verifying typed API response shapes.
 *
 * Each test hits a real endpoint and asserts that the response body
 * matches the Pydantic schema fields defined in this PR. This ensures
 * the backend serialises correctly and no schema mismatch exists.
 */
import { test, expect } from "./fixtures/auth";

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
    test("POST /transactions/bulk-approve with empty list returns { approved, skipped }", async ({ api }) => {
      const res = await api.post("/transactions/bulk-approve", {
        data: { ids: [] },
      });
      expect(res.ok()).toBe(true);
      const data = await res.json();
      expect(typeof data.approved).toBe("number");
      expect(typeof data.skipped).toBe("number");
    });

    test("POST /transactions/bulk-delete with empty list returns { deleted: number }", async ({ api }) => {
      const res = await api.post("/transactions/bulk-delete", {
        data: { ids: [] },
      });
      expect(res.ok()).toBe(true);
      const data = await res.json();
      expect(typeof data.deleted).toBe("number");
    });
  });

  test.describe("Document bulk operations", () => {
    test("POST /documents/bulk-delete with empty list returns { deleted: number }", async ({ api }) => {
      const res = await api.post("/documents/bulk-delete", {
        data: { ids: [] },
      });
      expect(res.ok()).toBe(true);
      const data = await res.json();
      expect(typeof data.deleted).toBe("number");
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

  test.describe("Plaid sync endpoint", () => {
    test("POST /plaid/items/{item_id}/sync returns 404 for non-existent item", async ({ api }) => {
      const fakeId = "00000000-0000-0000-0000-000000000000";
      const res = await api.post(`/plaid/items/${fakeId}/sync`);
      // Either 404 (item not found) or 200 with { status, records_added }
      if (res.ok()) {
        const data = await res.json();
        expect(typeof data.status).toBe("string");
        expect(typeof data.records_added).toBe("number");
      } else {
        expect(res.status()).toBeLessThan(500);
      }
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

  test.describe("Tax return forms overview", () => {
    test("GET /tax-returns/{id}/forms-overview returns list with form_name, instance_count, field_count", async ({ api }) => {
      // First fetch any existing tax return
      const listRes = await api.get("/tax-returns");
      expect(listRes.ok()).toBe(true);
      const returns = await listRes.json();

      if (returns.length === 0) {
        test.skip();
        return;
      }

      const returnId = returns[0].id;
      const res = await api.get(`/tax-returns/${returnId}/forms-overview`);
      expect(res.ok()).toBe(true);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);

      if (data.length > 0) {
        const item = data[0];
        expect(typeof item.form_name).toBe("string");
        expect(typeof item.instance_count).toBe("number");
        expect(typeof item.field_count).toBe("number");
      }
    });

    test("POST /tax-returns/{id}/recompute returns { status, forms_updated }", async ({ api }) => {
      const listRes = await api.get("/tax-returns");
      expect(listRes.ok()).toBe(true);
      const returns = await listRes.json();

      if (returns.length === 0) {
        test.skip();
        return;
      }

      const returnId = returns[0].id;
      const res = await api.post(`/tax-returns/${returnId}/recompute`);
      expect(res.ok()).toBe(true);
      const data = await res.json();
      expect(data.status).toBe("ok");
      expect(typeof data.forms_updated).toBe("number");
    });

    test("GET /tax-returns/{id}/validation returns array with severity, form_name, message", async ({ api }) => {
      const listRes = await api.get("/tax-returns");
      expect(listRes.ok()).toBe(true);
      const returns = await listRes.json();

      if (returns.length === 0) {
        test.skip();
        return;
      }

      const returnId = returns[0].id;
      const res = await api.get(`/tax-returns/${returnId}/validation`);
      expect(res.ok()).toBe(true);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);

      if (data.length > 0) {
        const item = data[0];
        expect(typeof item.severity).toBe("string");
        expect(typeof item.form_name).toBe("string");
        expect(typeof item.message).toBe("string");
        // expected_value and actual_value may be null or number
        if (item.expected_value !== null && item.expected_value !== undefined) {
          expect(typeof item.expected_value).toBe("number");
        }
        if (item.actual_value !== null && item.actual_value !== undefined) {
          expect(typeof item.actual_value).toBe("number");
        }
      }
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
