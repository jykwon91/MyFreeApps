import type { APIRequestContext } from "@playwright/test";
import type { DashboardPropertyIds } from "./dashboard-property-ids";
import type { DashboardSeedRow } from "./dashboard-seed-row";
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
    { property: "north", date: `${YEAR}-01-15`, type: "income", category: "rental_revenue", vendor: "E2E Tenant Jan", amount: "1200.00" },
    { property: "north", date: `${YEAR}-01-15`, type: "expense", category: "maintenance", vendor: "E2E Plumber Jan", amount: "300.00" },
    // The same category in the same month at the other property, so a drill-down
    // that loses the property filter shows the wrong rows.
    { property: "south", date: `${YEAR}-01-10`, type: "expense", category: "maintenance", vendor: "E2E Handyman Jan", amount: "100.00" },
    { property: "south", date: `${YEAR}-02-15`, type: "income", category: "rental_revenue", vendor: "E2E Tenant Feb", amount: "1800.00" },
    { property: "south", date: `${YEAR}-02-15`, type: "expense", category: "utilities", vendor: "E2E Power Feb", amount: "600.00" },
    { property: "north", date: `${YEAR}-03-15`, type: "income", category: "rental_revenue", vendor: "E2E Tenant Mar", amount: "900.00" },
    { property: "north", date: `${YEAR}-03-15`, type: "expense", category: "maintenance", vendor: "E2E Plumber Mar", amount: "150.00" },
  ],
  totals: { revenue: "$3,900.00", expenses: "$1,150.00", profit: "$2,750.00" },
  /** Three active months. */
  monthlyAverage: { revenue: "$1,300.00", expenses: "$383.33", profit: "$916.67" },
  /** January and February only. */
  janFeb: { revenue: "$3,000.00", expenses: "$1,000.00", profit: "$2,000.00" },
  byProperty: {
    north: { revenue: "$2,100.00", expenses: "$450.00", profit: "$1,650.00" },
    south: { revenue: "$1,800.00", expenses: "$700.00", profit: "$1,100.00" },
  },
  /** Every expense category, both properties. */
  byCategory: { maintenance: "$550.00", utilities: "$600.00" },
  /** Only the Rental Revenue and Maintenance categories. */
  rentalAndMaintenance: { revenue: "$3,900.00", expenses: "$550.00", profit: "$3,350.00" },
  /** Only the Maintenance category. */
  onlyMaintenance: { revenue: "$0.00", expenses: "$550.00", profit: "-$550.00" },
} as const;

/** Seeds DASHBOARD_SEED; returns the two properties' ids. */
export async function seedDashboard(api: APIRequestContext): Promise<DashboardPropertyIds> {
  const ids: DashboardPropertyIds = {
    north: (await createProperty(api, { name: DASHBOARD_SEED.properties.north })).id,
    south: (await createProperty(api, { name: DASHBOARD_SEED.properties.south })).id,
  };
  await seedTransactions(api, ids, DASHBOARD_SEED.transactions);
  return ids;
}

/** Creates each row as an approved transaction on its property. */
export async function seedTransactions(
  api: APIRequestContext,
  properties: DashboardPropertyIds,
  rows: readonly DashboardSeedRow[],
): Promise<void> {
  for (const row of rows) {
    await createApprovedTransaction(api, {
      property_id: properties[row.property],
      transaction_date: row.date,
      transaction_type: row.type,
      category: row.category,
      vendor: row.vendor,
      amount: row.amount,
    });
  }
}
