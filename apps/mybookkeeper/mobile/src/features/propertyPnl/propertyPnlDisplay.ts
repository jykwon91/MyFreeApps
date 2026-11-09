import { PROPERTY_PNL_PRESETS } from "@mybookkeeper/api-client/constants/propertyPnl";
import type { PropertyPnLPreset } from "@mybookkeeper/api-client/types/attribution/property-pnl-preset";
import type { PropertyPnLEntry } from "@mybookkeeper/api-client/types/attribution/property-pnl-entry";
import type { PropertyPnLRange } from "@mybookkeeper/api-client/types/attribution/property-pnl-range";
import { PROPERTY_PNL_MESSAGES as MESSAGES } from "../../constants/propertyPnl";
import { customRangeLabel, categoryLabel, spokenSignedMoney, spokenMoney } from "../transactions/transactionDisplay";

export function centsToDollars(cents: number): number {
  return cents / 100;
}

/** The chosen preset's name, or "Custom range" for dates picked by hand. */
export function periodName(preset: PropertyPnLPreset | null): string {
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
  return `+${count} more ${count === 1 ? MESSAGES.moreCategoriesOne : MESSAGES.moreCategoriesMany}`;
}
