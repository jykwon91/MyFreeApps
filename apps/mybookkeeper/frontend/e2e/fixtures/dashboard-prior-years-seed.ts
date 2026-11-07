import type { APIRequestContext } from "@playwright/test";
import { DASHBOARD_SEED } from "./dashboard-seed";
import type { SeedPropertyIds } from "./seed-property-ids";
import { seedTransactions } from "./seed-transactions";

const YEAR = DASHBOARD_SEED.year;

/**
 * Rows in the two years before DASHBOARD_SEED's, for the year filter. Seed it
 * after ``seedDashboard``, into the same organization and properties.
 */
export const PRIOR_YEARS_SEED = {
  lastYear: YEAR - 1,
  twoYearsAgo: YEAR - 2,
  transactions: [
    { property: "north", date: `${YEAR - 1}-06-15`, type: "income", category: "rental_revenue", vendor: "E2E Tenant Last Year", amount: "500.00" },
    { property: "north", date: `${YEAR - 1}-06-20`, type: "expense", category: "maintenance", vendor: "E2E Plumber Last Year", amount: "200.00" },
    { property: "south", date: `${YEAR - 2}-06-15`, type: "income", category: "rental_revenue", vendor: "E2E Tenant Two Years Ago", amount: "100.00" },
  ],
  /** The year before DASHBOARD_SEED's. */
  lastYearTotals: { revenue: "$500.00", expenses: "$200.00", profit: "$300.00" },
  /** All three years together, DASHBOARD_SEED's included. */
  allTimeTotals: { revenue: "$4,500.00", expenses: "$1,350.00", profit: "$3,150.00" },
} as const;

export function seedPriorYears(api: APIRequestContext, properties: SeedPropertyIds): Promise<void> {
  return seedTransactions(api, properties, PRIOR_YEARS_SEED.transactions);
}
