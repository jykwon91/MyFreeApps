export const DASHBOARD_TOTALS_MESSAGES = {
  couldntLoad: "I couldn't load your totals for this selection. Want me to try again?",
} as const;

export const PROPERTY_PNL_MESSAGES = {
  couldntLoad: "I couldn't load your property P&L for this period. Want me to try again?",
} as const;

export function taxSummaryLoadError(year: number): string {
  return `I couldn't load your ${year} tax summary. Want me to try again?`;
}
