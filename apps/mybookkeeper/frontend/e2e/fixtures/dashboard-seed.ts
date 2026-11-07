import type { APIRequestContext } from "@playwright/test";
import { createApprovedTransaction, createProperty } from "./seed-data";

const YEAR = new Date().getFullYear();

/**
 * Known data for the dashboard specs, all in the current year (the dashboard's
 * default view), January to March so the months exist whatever today is.
 * Seed it into a ``SoloOrg`` so nothing else adds to the totals.
 */
export const DASHBOARD_SEED = {
  year: YEAR,
  properties: { north: "E2E Dash North", south: "E2E Dash South" },
  transactions: [
    { property: "north", month: 1, type: "income", category: "rental_revenue", vendor: "E2E Tenant Jan", amount: "1200.00" },
    { property: "north", month: 1, type: "expense", category: "maintenance", vendor: "E2E Plumber Jan", amount: "300.00" },
    { property: "south", month: 2, type: "income", category: "rental_revenue", vendor: "E2E Tenant Feb", amount: "1800.00" },
    { property: "south", month: 2, type: "expense", category: "utilities", vendor: "E2E Power Feb", amount: "600.00" },
    { property: "north", month: 3, type: "income", category: "rental_revenue", vendor: "E2E Tenant Mar", amount: "900.00" },
    { property: "north", month: 3, type: "expense", category: "maintenance", vendor: "E2E Plumber Mar", amount: "150.00" },
  ],
  totals: { revenue: "$3,900.00", expenses: "$1,050.00", profit: "$2,850.00" },
  /** Three active months. */
  monthlyAverage: { revenue: "$1,300.00", expenses: "$350.00", profit: "$950.00" },
  /** January and February only. */
  janFeb: { revenue: "$3,000.00", expenses: "$900.00", profit: "$2,100.00" },
  byProperty: {
    north: { revenue: "$2,100.00", expenses: "$450.00", profit: "$1,650.00" },
    south: { revenue: "$1,800.00", expenses: "$600.00", profit: "$1,200.00" },
  },
} as const;

export async function seedDashboard(api: APIRequestContext): Promise<void> {
  const ids = {
    north: (await createProperty(api, { name: DASHBOARD_SEED.properties.north })).id,
    south: (await createProperty(api, { name: DASHBOARD_SEED.properties.south })).id,
  };
  for (const t of DASHBOARD_SEED.transactions) {
    await createApprovedTransaction(api, {
      property_id: ids[t.property],
      transaction_date: `${YEAR}-${String(t.month).padStart(2, "0")}-15`,
      transaction_type: t.type,
      category: t.category,
      vendor: t.vendor,
      amount: t.amount,
    });
  }
}
