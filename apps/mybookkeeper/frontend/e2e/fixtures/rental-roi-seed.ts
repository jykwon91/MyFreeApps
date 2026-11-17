import { expect, type APIRequestContext } from "@playwright/test";
import { format, startOfMonth, subMonths } from "date-fns";
import type { SeedRow } from "./seed-row";
import { seedTransactions } from "./seed-transactions";
import { createApprovedTransaction, createProperty } from "./seed-data";

const day = (monthsBack: number) => format(startOfMonth(subMonths(new Date(), monthsBack)), "yyyy-MM-dd");

/**
 * The tab averages the last 12 full months, so every row sits 1–12 months
 * back except one this month, which must be left out.
 *
 * North (bought for $200,000, no mortgage record): rent $24,000 → $2,000/mo;
 * mortgage interest + principal $12,000 → $1,000/mo; maintenance $2,400 →
 * $200/mo. Break-even $1,200/mo; at 8% the target adds 8% × $200,000 / 12.
 *
 * South (no purchase price): rent $6,000 → $500/mo; maintenance $1,200 → $100/mo.
 */
const rows: readonly SeedRow[] = [
  { property: "north", date: day(2), type: "income", category: "rental_revenue", vendor: "E2E Tenant", amount: "12000.00" },
  { property: "north", date: day(7), type: "income", category: "rental_revenue", vendor: "E2E Tenant", amount: "12000.00" },
  { property: "north", date: day(3), type: "expense", category: "mortgage_interest", vendor: "E2E Lender", amount: "6000.00" },
  { property: "north", date: day(3), type: "expense", category: "mortgage_principal", vendor: "E2E Lender", amount: "6000.00" },
  { property: "north", date: day(5), type: "expense", category: "maintenance", vendor: "E2E Plumber", amount: "2400.00" },
  // This month isn't a full month yet, so it's outside the window.
  { property: "north", date: day(0), type: "income", category: "rental_revenue", vendor: "E2E Tenant", amount: "9999.00" },
  { property: "south", date: day(4), type: "income", category: "rental_revenue", vendor: "E2E Tenant", amount: "6000.00" },
  { property: "south", date: day(8), type: "expense", category: "maintenance", vendor: "E2E Plumber", amount: "1200.00" },
];

export const RENTAL_ROI_SEED = {
  properties: { north: "E2E ROI North", south: "E2E ROI South" },
  headline: "Break-even: $1,300/mo",
  coverage: "target for 1 of 2 properties",
  actual: "$2,500/mo",
  gap: "$1,200 ahead vs. break-even",
  north: {
    breakEven: "$1,200",
    // $1,200 + 8% × $200,000 / 12 = $2,533.33
    target8: "$2,533",
    gap8: "$533 short",
    // $1,200 + 12% × $200,000 / 12 = $3,200
    target12: "$3,200",
  },
  south: { breakEven: "$100" },
  unassigned: "$100/mo of revenue isn't tied to a property.",
} as const;

/** Two investment properties, one with a purchase price, plus $1,200 of rent on no property. */
export async function seedRentalRoi(api: APIRequestContext): Promise<void> {
  const north = await createProperty(api, { name: RENTAL_ROI_SEED.properties.north, classification: "investment", type: "long_term" });
  const south = await createProperty(api, { name: RENTAL_ROI_SEED.properties.south, classification: "investment", type: "long_term" });
  const priced = await api.patch(`/properties/${north.id}`, { data: { purchase_price: "200000.00" } });
  expect(priced.ok(), await priced.text()).toBe(true);
  await seedTransactions(api, { north: north.id, south: south.id }, rows);
  await createApprovedTransaction(api, {
    transaction_date: day(6),
    transaction_type: "income",
    category: "rental_revenue",
    vendor: "E2E Unassigned Tenant",
    amount: "1200.00",
  });
}
