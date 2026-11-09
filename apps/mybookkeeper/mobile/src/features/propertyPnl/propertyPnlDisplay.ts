import { PROPERTY_PNL_PRESETS } from "@mybookkeeper/api-client/constants/propertyPnl";
import type { PropertyPnLEntry } from "@mybookkeeper/api-client/types/attribution/property-pnl-entry";
import type { PropertyPnLRange } from "@mybookkeeper/api-client/types/attribution/property-pnl-range";
import { activePropertyPnlPreset } from "@mybookkeeper/api-client/utils/propertyPnlRange";
import { PROPERTY_PNL_MESSAGES as MESSAGES } from "../../constants/propertyPnl";
import { customRangeLabel, categoryLabel, spokenSignedMoney, spokenMoney } from "../transactions/transactionDisplay";

const PRESET_KEYS = PROPERTY_PNL_PRESETS.map((preset) => preset.key);

export function centsToDollars(cents: number): number {
  return cents / 100;
}

/** "This month" when the range starts where a preset does, else just its two days. */
export function periodName(range: PropertyPnLRange, today: Date): string {
  const preset = activePropertyPnlPreset(range, PRESET_KEYS, today);
  return PROPERTY_PNL_PRESETS.find((option) => option.key === preset)?.label ?? MESSAGES.customRange;
}

export function periodDates(range: PropertyPnLRange): string {
  return customRangeLabel(range.since, range.until);
}

export function totalsLabel(revenueCents: number, expensesCents: number, netCents: number, dates: string): string {
  return `${dates}. ${MESSAGES.revenue} ${spokenMoney(centsToDollars(revenueCents))}, ${MESSAGES.expenses} ${spokenMoney(centsToDollars(expensesCents))}, ${MESSAGES.net} ${spokenSignedMoney(centsToDollars(netCents))}.`;
}

export function cardLabel(entry: PropertyPnLEntry): string {
  const breakdown = entry.expense_breakdown.map((item) => `${categoryLabel(item.category)} ${spokenMoney(centsToDollars(item.amount_cents))}`);
  return [
    entry.name,
    `${MESSAGES.net} ${spokenSignedMoney(centsToDollars(entry.net_cents))}`,
    `${MESSAGES.revenue} ${spokenMoney(centsToDollars(entry.revenue_cents))}`,
    `${MESSAGES.expenses} ${spokenMoney(centsToDollars(entry.expenses_cents))}`,
    ...breakdown,
  ].join(", ");
}

export function moreCategoriesLine(count: number): string {
  return `+${count} more ${count === 1 ? "category" : "categories"}`;
}
