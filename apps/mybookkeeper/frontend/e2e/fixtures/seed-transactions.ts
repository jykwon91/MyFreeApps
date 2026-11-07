import type { APIRequestContext } from "@playwright/test";
import type { SeedPropertyIds } from "./seed-property-ids";
import type { SeedRow } from "./seed-row";
import { createApprovedTransaction } from "./seed-data";

/** Creates each row as an approved transaction on its property. */
export async function seedTransactions(
  api: APIRequestContext,
  properties: SeedPropertyIds,
  rows: readonly SeedRow[],
): Promise<void> {
  for (const row of rows) {
    await createApprovedTransaction(api, {
      property_id: properties[row.property],
      transaction_date: row.date,
      transaction_type: row.type,
      category: row.category,
      sub_category: row.sub_category,
      vendor: row.vendor,
      amount: row.amount,
    });
  }
}
