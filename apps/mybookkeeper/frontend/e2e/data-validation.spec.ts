import { test, expect, type APIRequestContext } from "@playwright/test";
import { DASHBOARD_SEED } from "./fixtures/dashboard-seed";
import { createApprovedTransaction } from "./fixtures/seed-data";
import { seededOrg } from "./fixtures/seeded-org";
import { TRANSACTIONS_SEED, seedTransactionsPage } from "./fixtures/transactions-seed";

const YEAR = DASHBOARD_SEED.year;
const TAX_YEAR = YEAR - 1;
const RECEIPT = "e2e-data-validation-receipt.pdf";

/** Prior-year rows for the tax summary; the last one isn't tax-relevant, so it must not count. */
const TAX_ROWS = [
  { property: "north", vendor: "E2E Tax Tenant", transaction_type: "income", category: "rental_revenue", amount: "2000.00", tax_relevant: true },
  { property: "north", vendor: "E2E Tax Plumber", transaction_type: "expense", category: "maintenance", amount: "500.00", tax_relevant: true },
  { property: "south", vendor: "E2E Tax Power", transaction_type: "expense", category: "utilities", amount: "300.00", tax_relevant: true },
  { property: "south", vendor: "E2E Personal Repair", transaction_type: "expense", category: "maintenance", amount: "999.00", tax_relevant: false },
] as const;

async function seed(api: APIRequestContext): Promise<void> {
  await seedTransactionsPage(api);
  const properties = (await (await api.get("/properties")).json()) as Property[];
  const idOf = (key: "north" | "south") => properties.find((p) => p.name === DASHBOARD_SEED.properties[key])?.id;
  for (const { property, ...row } of TAX_ROWS) {
    await createApprovedTransaction(api, { ...row, property_id: idOf(property), transaction_date: `${TAX_YEAR}-06-15` });
  }
  const res = await api.post("/test/seed-document", { data: { file_name: RECEIPT, document_type: "receipt" } });
  expect(res.status(), await res.text()).toBe(201);
}

async function getJson<T>(api: APIRequestContext, url: string): Promise<T> {
  const res = await api.get(url);
  expect(res.ok(), `GET ${url}: ${res.status()} ${await res.text()}`).toBe(true);
  return res.json();
}

interface Property {
  id: string;
  name: string;
  type: string;
}

interface Transaction {
  vendor: string;
  amount: string;
  transaction_date: string;
  transaction_type: string;
  category: string;
  status: string;
  property_id: string | null;
}

test.describe("Data validation — API responses for known data", () => {
  test.describe.configure({ mode: "serial" });
  const org = seededOrg("data-validation", seed);

  async function propertyIds(): Promise<Record<string, string>> {
    const properties = await getJson<Property[]>(org().api, "/properties");
    return Object.fromEntries(properties.map((p) => [p.name, p.id]));
  }

  test("properties are the two seeded ones", async () => {
    const properties = await getJson<Property[]>(org().api, "/properties");
    expect(properties.map((p) => p.name).sort()).toEqual(Object.values(DASHBOARD_SEED.properties).sort());
    for (const p of properties) {
      expect(p.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(["short_term", "long_term"]).toContain(p.type);
    }
  });

  test("transactions come back exactly as seeded", async () => {
    const ids = await propertyIds();
    const transactions = await getJson<Transaction[]>(org().api, "/transactions");
    expect(transactions).toHaveLength(TRANSACTIONS_SEED.count + TAX_ROWS.length);

    for (const row of TRANSACTIONS_SEED.approved) {
      const txn = transactions.find((t) => t.vendor === row.vendor);
      expect(txn, row.vendor).toMatchObject({
        amount: row.amount,
        transaction_date: row.date,
        transaction_type: row.type,
        category: row.category,
        status: "approved",
        property_id: ids[DASHBOARD_SEED.properties[row.property]],
      });
    }
    const flagged = transactions.find((t) => t.vendor === TRANSACTIONS_SEED.flagged.vendor);
    expect(flagged).toMatchObject({ amount: TRANSACTIONS_SEED.flagged.amount, status: "needs_review" });
  });

  test("summary totals, months, properties and categories add up", async () => {
    const ids = await propertyIds();
    const summary = await getJson<Record<string, unknown>>(org().api, `/summary?start_date=${YEAR}-01-01T00:00:00&end_date=${YEAR}-12-31T23:59:59`);
    expect(summary).toMatchObject({ revenue: 3900, expenses: 1150, profit: 2750 });
    expect(summary.by_month).toEqual([
      { month: `${YEAR}-01`, revenue: 1200, expenses: 400, profit: 800 },
      { month: `${YEAR}-02`, revenue: 1800, expenses: 600, profit: 1200 },
      { month: `${YEAR}-03`, revenue: 900, expenses: 150, profit: 750 },
    ]);
    expect(summary.by_property).toEqual(expect.arrayContaining([
      { property_id: ids[DASHBOARD_SEED.properties.north], name: DASHBOARD_SEED.properties.north, revenue: 2100, expenses: 450, profit: 1650 },
      { property_id: ids[DASHBOARD_SEED.properties.south], name: DASHBOARD_SEED.properties.south, revenue: 1800, expenses: 700, profit: 1100 },
    ]));
    expect(summary.by_property).toHaveLength(2);
    expect(summary.by_category).toEqual({ rental_revenue: 3900, maintenance: 550, utilities: 600 });
  });

  test("tax summary counts only tax-relevant transactions", async () => {
    const ids = await propertyIds();
    const tax = await getJson<Record<string, unknown>>(org().api, `/summary/tax?year=${TAX_YEAR}`);
    expect(tax).toMatchObject({ year: TAX_YEAR, gross_revenue: 2000, total_deductions: 800, net_taxable_income: 1200 });
    expect(tax.by_property).toEqual(expect.arrayContaining([
      { property_id: ids[DASHBOARD_SEED.properties.north], name: DASHBOARD_SEED.properties.north, revenue: 2000, expenses: 500, net_income: 1500 },
      { property_id: ids[DASHBOARD_SEED.properties.south], name: DASHBOARD_SEED.properties.south, revenue: 0, expenses: 300, net_income: -300 },
    ]));
    expect(tax.by_property).toHaveLength(2);

    // The dashboard rows aren't tax-relevant.
    const thisYear = await getJson<Record<string, unknown>>(org().api, `/summary/tax?year=${YEAR}`);
    expect(thisYear).toMatchObject({ gross_revenue: 0, total_deductions: 0, net_taxable_income: 0, by_property: [] });
  });

  test("documents list the seeded receipt", async () => {
    const documents = await getJson<{ id: string; file_name: string; status: string; created_at: string }[]>(org().api, "/documents");
    const receipt = documents.find((d) => d.file_name === RECEIPT);
    expect(receipt).toMatchObject({ status: "completed" });
    expect(receipt?.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(Number.isNaN(Date.parse(receipt?.created_at ?? ""))).toBe(false);
  });
});
