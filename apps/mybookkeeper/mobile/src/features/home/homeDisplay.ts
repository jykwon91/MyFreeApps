import { HOME_PERIODS, type HomePeriod } from "../../constants/home";

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

export function waitingFailedMessage(transactionsFailed: boolean, documentsFailed: boolean): string | null {
  if (transactionsFailed && documentsFailed) return "I couldn't check what's waiting for you.";
  if (transactionsFailed) return "I couldn't check your transactions.";
  if (documentsFailed) return "I couldn't check your documents.";
  return null;
}
