import type { MonthSummary } from "@mybookkeeper/api-client/types/summary/MonthSummary";
import type { UtilityPlanRenewalAlert } from "@mybookkeeper/api-client/types/utility/utility-plan-renewal-alert";
import { HOME_PERIODS, type HomePeriod } from "../../constants/home";
import { monthName } from "../../lib/localDate";
import type { HomeAlertFailures } from "../../types/HomeAlertFailures";
import { spokenMoney } from "../transactions/transactionDisplay";

function counted(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

export function transactionsWaiting(count: number): string {
  return `${counted(count, "transaction", "transactions")} to review`;
}

export function documentsWaiting(count: number): string {
  return `${counted(count, "document needs", "documents need")} a look`;
}

export function periodLabel(period: HomePeriod): string {
  return HOME_PERIODS.find((option) => option.value === period)?.label ?? "";
}

/** "This month" reads as "this month's numbers" in a sentence. */
export function numbersFailedMessage(period: HomePeriod): string {
  return `I couldn't load ${periodLabel(period).toLowerCase()}'s numbers.`;
}

export function receiptsWaiting(count: number): string {
  return `${counted(count, "rent receipt", "rent receipts")} waiting to send`;
}

export function waitingFailedMessage(failed: { transactions: boolean; documents: boolean; receipts: boolean }): string | null {
  const failures = [failed.transactions, failed.documents, failed.receipts].filter(Boolean).length;
  if (failures > 1) return "I couldn't check what's waiting for you.";
  if (failed.transactions) return "I couldn't check your transactions.";
  if (failed.documents) return "I couldn't check your documents.";
  if (failed.receipts) return "I couldn't check your rent receipts.";
  return null;
}

/** A single month has nothing to compare against, so the chart only has a place in a longer period. */
export function periodHasMonths(period: HomePeriod): boolean {
  return period !== "thisMonth";
}

export function renewalAlertLabel(alert: UtilityPlanRenewalAlert): string {
  const lapsed = alert.expired.length;
  const endingSoon = alert.expiring_soon.length;
  if (lapsed > 0 && endingSoon > 0) return `${counted(alert.total_needing_attention, "utility plan needs", "utility plans need")} renewing`;
  if (lapsed > 0) return `${counted(lapsed, "utility plan has", "utility plans have")} lapsed`;
  return `${counted(endingSoon, "utility plan ends", "utility plans end")} within ${alert.window_days} days`;
}

export function utilityRatesAlertLabel(count: number): string {
  return `${counted(count, "utility plan", "utility plans")} priced above market`;
}

export function insurancePremiumsAlertLabel(count: number): string {
  return `${counted(count, "insurance policy", "insurance policies")} priced above market`;
}

export function alertsFailedMessage(failed: HomeAlertFailures): string | null {
  const failures = [failed.renewals, failed.utilityRates, failed.insurancePremiums].filter(Boolean).length;
  if (failures > 1) return "I couldn't check your utility plans and insurance.";
  if (failed.renewals) return "I couldn't check your utility plan renewals.";
  if (failed.utilityRates) return "I couldn't compare your utility rates to the market.";
  if (failed.insurancePremiums) return "I couldn't compare your insurance premiums to the market.";
  return null;
}

/** Side axis of the chart: "$4k", or whole dollars below a thousand. */
export function axisMoney(value: number): string {
  return Math.abs(value) >= 1000 ? `$${Math.round(value / 1000)}k` : `$${Math.round(value)}`;
}

export function spokenMonth(month: MonthSummary): string {
  return `Revenue ${spokenMoney(month.revenue)}, expenses ${spokenMoney(month.expenses)}, ${monthName(month.month, "long")}`;
}

export function monthlyChartSummary(months: readonly MonthSummary[]): string {
  const first = months[0];
  const last = months[months.length - 1];
  if (!first || !last) return "";
  return `Revenue and expenses by month, ${monthName(first.month, "long")} to ${monthName(last.month, "long")}. Approved transactions only.`;
}
