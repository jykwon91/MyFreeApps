import type { APIRequestContext } from "@playwright/test";
import type { ExtractedTransactionInput } from "./extracted-transaction-input";
import { DASHBOARD_SEED, seedDashboard } from "./dashboard-seed";
import { seedExtractedTransaction } from "./seed-extracted-transaction";

const FLAGGED: ExtractedTransactionInput = {
  file_name: "e2e-roof-receipt.png",
  vendor: "E2E Roofer",
  amount: "420.00",
  transaction_date: `${DASHBOARD_SEED.year}-02-20`,
  review_reason: "I couldn't tell which property this roof repair was for.",
};

/**
 * Known data for the Transactions page: DASHBOARD_SEED's seven approved
 * transactions, plus one that extraction flagged for review.
 */
export const TRANSACTIONS_SEED = {
  approved: DASHBOARD_SEED.transactions,
  flagged: FLAGGED,
  count: DASHBOARD_SEED.transactions.length + 1,
} as const;

export async function seedTransactionsPage(api: APIRequestContext): Promise<void> {
  await seedDashboard(api);
  await seedExtractedTransaction(api, FLAGGED);
}
