import { expect, type APIRequestContext } from "@playwright/test";
import type { ExtractedTransactionInput } from "./extracted-transaction-input";
import type { SeededExtractedTransaction } from "./seeded-extracted-transaction";

/**
 * Test-only route: on a keyless E2E stack extraction never runs, and only
 * extraction sets a review reason or a source document.
 */
export async function seedExtractedTransaction(
  api: APIRequestContext,
  input: ExtractedTransactionInput,
): Promise<SeededExtractedTransaction> {
  const res = await api.post("/test/seed-extracted-transaction", { data: input });
  expect(res.status(), await res.text()).toBe(201);
  return res.json();
}
