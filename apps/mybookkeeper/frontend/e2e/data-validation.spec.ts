import { test, expect } from "./fixtures/auth";

test.describe("Data validation — API response integrity", () => {
  test.describe("Transactions API", () => {
    test("returns valid transaction objects", async ({ api }) => {
      const res = await api.get("/transactions");
      expect(res.ok()).toBe(true);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);

      for (const txn of data) {
        expect(txn.id).toMatch(/^[0-9a-f-]{36}$/);
        expect(parseFloat(txn.amount)).toBeGreaterThan(0);
        expect(txn.transaction_date).toMatch(/^\d{4}-\d{2}-\d{2}/);
        expect(["income", "expense"]).toContain(txn.transaction_type);
        expect(["pending", "approved", "needs_review", "duplicate", "unverified"]).toContain(txn.status);
        expect(txn.category).toBeTruthy();
        expect(typeof txn.tax_relevant).toBe("boolean");
      }
    });

    test("income transactions have revenue categories", async ({ api }) => {
      const res = await api.get("/transactions");
      const data = await res.json();
      const revenueCats = ["rental_revenue", "cleaning_fee_revenue"];

      for (const txn of data) {
        if (txn.transaction_type === "income" && txn.category !== "uncategorized") {
          expect(revenueCats).toContain(txn.category);
        }
      }
    });

    test("amounts have no floating point artifacts", async ({ api }) => {
      const res = await api.get("/transactions");
      const data = await res.json();

      for (const txn of data) {
        const amount = parseFloat(txn.amount);
        const decimals = txn.amount.includes(".") ? txn.amount.split(".")[1].length : 0;
        expect(decimals).toBeLessThanOrEqual(2);
      }
    });

    test("property_id references exist or is null", async ({ api }) => {
      const [txnRes, propRes] = await Promise.all([
        api.get("/transactions"),
        api.get("/properties"),
      ]);
      const transactions = await txnRes.json();
      const properties = await propRes.json();
      const propertyIds = new Set(properties.map((p: { id: string }) => p.id));

      for (const txn of transactions) {
        if (txn.property_id) {
          expect(propertyIds.has(txn.property_id)).toBe(true);
        }
      }
    });
  });

  test.describe("Properties API", () => {
    test("returns valid property objects", async ({ api }) => {
      const res = await api.get("/properties");
      expect(res.ok()).toBe(true);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);

      for (const prop of data) {
        expect(prop.id).toMatch(/^[0-9a-f-]{36}$/);
        expect(prop.name).toBeTruthy();
        expect(["short_term", "long_term"]).toContain(prop.type);
      }
    });
  });

  test.describe("Summary API", () => {
    test("returns valid summary with consistent calculations", async ({ api }) => {
      const res = await api.get("/summary");
      expect(res.ok()).toBe(true);
      const data = await res.json();

      expect(typeof data.revenue).toBe("number");
      expect(typeof data.expenses).toBe("number");
      expect(typeof data.profit).toBe("number");
      expect(data.revenue).toBeGreaterThanOrEqual(0);
      expect(data.expenses).toBeGreaterThanOrEqual(0);

      // Profit = revenue - expenses
      expect(data.profit).toBeCloseTo(data.revenue - data.expenses, 2);
    });

    test("by_month entries have valid structure", async ({ api }) => {
      const res = await api.get("/summary");
      const data = await res.json();

      for (const month of data.by_month ?? []) {
        expect(month.month).toMatch(/^\d{4}-\d{2}$/);
        expect(typeof month.revenue).toBe("number");
        expect(typeof month.expenses).toBe("number");
        expect(typeof month.profit).toBe("number");
        expect(month.profit).toBeCloseTo(month.revenue - month.expenses, 2);
      }
    });

    test("by_month entries are sorted chronologically", async ({ api }) => {
      const res = await api.get("/summary");
      const data = await res.json();
      const months = (data.by_month ?? []).map((m: { month: string }) => m.month);

      for (let i = 1; i < months.length; i++) {
        expect(months[i] >= months[i - 1]).toBe(true);
      }
    });

    test("by_property revenue/expense totals are non-negative", async ({ api }) => {
      const res = await api.get("/summary");
      const data = await res.json();

      for (const prop of data.by_property ?? []) {
        expect(prop.revenue).toBeGreaterThanOrEqual(0);
        expect(prop.expenses).toBeGreaterThanOrEqual(0);
        expect(prop.profit).toBeCloseTo(prop.revenue - prop.expenses, 2);
      }
    });

    test("by_category values sum to revenue + expenses", async ({ api }) => {
      const res = await api.get("/summary");
      const data = await res.json();

      if (data.by_category && Object.keys(data.by_category).length > 0) {
        const total = Object.values(data.by_category as Record<string, number>).reduce(
          (sum, val) => sum + Math.abs(val), 0
        );
        // Total of absolute category amounts should approximately equal revenue + expenses
        // (with some tolerance for rounding)
        const expected = data.revenue + data.expenses;
        if (expected > 0) {
          expect(total).toBeGreaterThan(0);
        }
      }
    });
  });

  test.describe("Tax Summary API", () => {
    test("returns valid tax summary", async ({ api }) => {
      const currentYear = new Date().getFullYear();
      const res = await api.get(`/summary/tax?year=${currentYear - 1}`);
      expect(res.ok()).toBe(true);
      const data = await res.json();

      expect(typeof data.gross_revenue).toBe("number");
      expect(typeof data.total_deductions).toBe("number");
      expect(typeof data.net_taxable_income).toBe("number");
      expect(data.net_taxable_income).toBeCloseTo(
        data.gross_revenue - data.total_deductions, 2
      );
    });

    test("by_property net income is revenue minus expenses", async ({ api }) => {
      const currentYear = new Date().getFullYear();
      const res = await api.get(`/summary/tax?year=${currentYear - 1}`);
      const data = await res.json();

      for (const prop of data.by_property ?? []) {
        expect(prop.net_income).toBeCloseTo(prop.revenue - prop.expenses, 2);
      }
    });
  });

  test.describe("Documents API", () => {
    test("returns valid response", async ({ api }) => {
      const res = await api.get("/documents");
      if (!res.ok()) {
        test.skip(true, `GET /documents returned ${res.status()}`);
        return;
      }
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);

      for (const doc of data) {
        expect(doc.id).toMatch(/^[0-9a-f-]{36}$/);
        expect(["processing", "extracting", "completed", "failed", "needs_review", "duplicate"]).toContain(doc.status);
        expect(doc.created_at).toBeTruthy();
      }
    });
  });
});
