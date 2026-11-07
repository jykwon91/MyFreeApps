import type { APIRequestContext } from "@playwright/test";
import { endOfMonth, format, getQuarter, startOfMonth, subMonths } from "date-fns";
import type { SeedRow } from "./seed-row";
import { seedTransactions } from "./seed-transactions";
import { createProperty } from "./seed-data";
import type { UtilityCardTotals } from "./utility-card-totals";

const now = new Date();
const monthsAgo = (n: number) => startOfMonth(subMonths(now, n));
const day = (d: Date) => format(d, "yyyy-MM-dd");

/**
 * The page's default range runs from the start of the month 11 months ago to
 * the end of this month. Bills sit this month, 3 months ago and right at the
 * range's first day, which gives three months that always fall in three
 * different quarters. One more sits on the last day before the range starts.
 */
const THIS_MONTH = monthsAgo(0);
const THREE_MONTHS_AGO = monthsAgo(3);
const RANGE_START = monthsAgo(11);
const BEFORE_RANGE = endOfMonth(monthsAgo(12));
const BILL_MONTHS = [RANGE_START, THREE_MONTHS_AGO, THIS_MONTH];

const rows: readonly SeedRow[] = [
  { property: "north", date: day(THIS_MONTH), type: "expense", category: "utilities", sub_category: "electricity", vendor: "E2E Power Co", amount: "120.00" },
  { property: "north", date: day(THIS_MONTH), type: "expense", category: "utilities", sub_category: "water", vendor: "E2E Water Co", amount: "45.00" },
  { property: "south", date: day(THIS_MONTH), type: "expense", category: "utilities", sub_category: "electricity", vendor: "E2E Power Co", amount: "80.00" },
  // A combined bill with no single utility type: counted under Other.
  { property: "north", date: day(THIS_MONTH), type: "expense", category: "utilities", vendor: "E2E Combined Utilities", amount: "30.00" },
  { property: "north", date: day(THREE_MONTHS_AGO), type: "expense", category: "utilities", sub_category: "electricity", vendor: "E2E Power Co", amount: "100.00" },
  { property: "south", date: day(THREE_MONTHS_AGO), type: "expense", category: "utilities", sub_category: "gas", vendor: "E2E Gas Co", amount: "60.00" },
  { property: "south", date: day(RANGE_START), type: "expense", category: "utilities", sub_category: "internet", vendor: "E2E Fiber Co", amount: "25.00" },
  { property: "north", date: day(BEFORE_RANGE), type: "expense", category: "utilities", sub_category: "water", vendor: "E2E Water Co", amount: "999.00" },
  // Not a utility, so analytics must leave it out.
  { property: "north", date: day(THIS_MONTH), type: "expense", category: "maintenance", vendor: "E2E Plumber", amount: "500.00" },
];

const TOTALS: UtilityCardTotals = {
  total: "$460.00", electricity: "$300.00", water: "$45.00", gas: "$60.00",
  internet: "$25.00", trash: "$0.00", sewer: "$0.00", other: "$30.00",
};
const NORTH_TOTALS: UtilityCardTotals = {
  total: "$295.00", electricity: "$220.00", water: "$45.00", gas: "$0.00",
  internet: "$0.00", trash: "$0.00", sewer: "$0.00", other: "$30.00",
};

/** Known utility bills for the analytics specs. Seed into a fresh organization. */
export const ANALYTICS_SEED = {
  properties: { north: "E2E Util North", south: "E2E Util South" },
  /** The default range, both properties. */
  totals: TOTALS,
  /** Utility types with spend in the default range: electricity, water, gas, internet, other. */
  typesInRange: 5,
  /** The x-axis labels for the default range, oldest first. */
  monthLabels: BILL_MONTHS.map((d) => format(d, "MMM ''yy")),
  quarterLabels: BILL_MONTHS.map((d) => `Q${getQuarter(d)} '${format(d, "yy")}`),
  /** North only, default range: two months, three types (electricity, water, other). */
  north: NORTH_TOTALS,
  northPeriods: 2,
  northTypesInRange: 3,
  /** From the start of this month. */
  thisMonth: {
    from: day(THIS_MONTH),
    to: day(endOfMonth(THIS_MONTH)),
    total: "$275.00",
    totalSpend: 275,
    summary: { electricity: 200, water: 45, other: 30 },
  },
  /** The month before the range starts, ending on the day of its one bill. */
  beforeRange: { from: day(startOfMonth(BEFORE_RANGE)), to: day(BEFORE_RANGE), total: "$999.00" },
} as const;

export async function seedAnalytics(api: APIRequestContext): Promise<void> {
  const properties = {
    north: (await createProperty(api, { name: ANALYTICS_SEED.properties.north })).id,
    south: (await createProperty(api, { name: ANALYTICS_SEED.properties.south })).id,
  };
  await seedTransactions(api, properties, rows);
}
