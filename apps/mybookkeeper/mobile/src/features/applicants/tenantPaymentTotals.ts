import type { Transaction } from "@mybookkeeper/api-client/types/transaction/transaction";

const DEPOSIT_CATEGORY = "security_deposit";

function toCents(amount: string): number {
  return Math.round(Number(amount) * 100);
}

/** Only approved rows count: one still waiting on review may not be real money yet. */
export function tenantPaymentTotals(payments: readonly Transaction[]): { received: number; deposits: number } {
  const approved = payments.filter((payment) => payment.status === "approved");
  const sum = (rows: readonly Transaction[]) => rows.reduce((cents, row) => cents + toCents(row.amount), 0) / 100;
  return { received: sum(approved), deposits: sum(approved.filter((payment) => payment.category === DEPOSIT_CATEGORY)) };
}
