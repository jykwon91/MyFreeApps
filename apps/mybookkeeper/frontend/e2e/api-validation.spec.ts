import { test, expect } from "./fixtures/auth";

test.describe("API endpoint validation", () => {
  test.describe("Health API", () => {
    test("health check returns ok", async ({ api }) => {
      const res = await api.get("/health");
      expect(res.ok()).toBe(true);
    });

    test("health summary returns status", async ({ api }) => {
      const res = await api.get("/health/summary");
      expect(res.ok()).toBe(true);
      const data = await res.json();
      expect(data.status).toBeTruthy();
    });

    test("health events returns array", async ({ api }) => {
      const res = await api.get("/health/events");
      expect(res.ok()).toBe(true);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
    });
  });

  test.describe("Cost API", () => {
    test("cost summary returns data", async ({ api }) => {
      const res = await api.get("/admin/costs/summary");
      expect(res.ok()).toBe(true);
      const data = await res.json();
      expect(typeof data.today).toBe("number");
    });

    test("cost timeline returns array", async ({ api }) => {
      const res = await api.get("/admin/costs/timeline");
      expect(res.ok()).toBe(true);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
    });

    test("cost thresholds returns config", async ({ api }) => {
      const res = await api.get("/admin/costs/thresholds");
      expect(res.ok()).toBe(true);
      const data = await res.json();
      expect(data.daily_budget).toBeDefined();
      expect(data.monthly_budget).toBeDefined();
    });

    test("cost by user returns array", async ({ api }) => {
      const res = await api.get("/admin/costs/by-user?period=month");
      expect(res.ok()).toBe(true);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
    });
  });

  test.describe("Organizations API", () => {
    test("list organizations returns array", async ({ api }) => {
      const res = await api.get("/organizations");
      expect(res.ok()).toBe(true);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThan(0);

      const org = data[0];
      expect(org.id).toBeTruthy();
      expect(org.name).toBeTruthy();
    });
  });

  test.describe("Integrations API", () => {
    test("list integrations returns array", async ({ api }) => {
      const res = await api.get("/integrations");
      expect(res.ok()).toBe(true);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
    });
  });

  test.describe("Classification Rules API", () => {
    test("list classification rules returns array", async ({ api }) => {
      const res = await api.get("/classification-rules");
      expect(res.ok()).toBe(true);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
    });
  });

  test.describe("Tax Returns API", () => {
    test("list tax returns returns array", async ({ api }) => {
      const res = await api.get("/tax-returns");
      expect(res.ok()).toBe(true);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);

      if (data.length > 0) {
        const tr = data[0];
        expect(tr.id).toBeTruthy();
        expect(tr.tax_year).toBeTruthy();
        expect(tr.filing_status).toBeTruthy();
        expect(tr.status).toBeTruthy();
      }
    });
  });

  test.describe("Reconciliation API", () => {
    test("list sources returns response", async ({ api }) => {
      const res = await api.get("/reconciliation/sources");
      expect(res.ok()).toBe(true);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
    });

    test("list discrepancies returns response", async ({ api }) => {
      const res = await api.get("/reconciliation/discrepancies");
      expect(res.ok()).toBe(true);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
    });
  });

  test.describe("Admin API", () => {
    test("admin stats returns data", async ({ api }) => {
      const res = await api.get("/admin/stats");
      expect(res.ok()).toBe(true);
      const data = await res.json();
      expect(data.total_users).toBeDefined();
      expect(data.total_organizations).toBeDefined();
    });

    test("admin users returns array", async ({ api }) => {
      const res = await api.get("/admin/users");
      expect(res.ok()).toBe(true);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
    });

    test("admin orgs returns array", async ({ api }) => {
      const res = await api.get("/admin/orgs");
      expect(res.ok()).toBe(true);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
    });
  });

  test.describe("Reservations API", () => {
    test("list reservations returns response", async ({ api }) => {
      const res = await api.get("/reservations");
      expect(res.ok()).toBe(true);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
    });
  });

  test.describe("Exports API", () => {
    test("export transactions CSV returns file", async ({ api }) => {
      const res = await api.get("/exports/transactions/csv");
      expect(res.ok()).toBe(true);
      expect(res.headers()["content-type"]).toContain("text/csv");
    });

    test("export transactions PDF returns file", async ({ api }) => {
      const res = await api.get("/exports/transactions/pdf");
      expect(res.ok()).toBe(true);
      expect(res.headers()["content-type"]).toContain("application/pdf");
    });

    test("export schedule E returns file", async ({ api }) => {
      const res = await api.get("/exports/schedule-e/2025");
      expect(res.ok()).toBe(true);
      expect(res.headers()["content-type"]).toBeDefined();
    });

    test("export tax summary returns file", async ({ api }) => {
      const res = await api.get("/exports/tax-summary/2025");
      expect(res.ok()).toBe(true);
      expect(res.headers()["content-type"]).toBeDefined();
    });
  });
});
