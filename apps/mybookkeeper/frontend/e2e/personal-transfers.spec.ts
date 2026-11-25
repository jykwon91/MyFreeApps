import { test, expect, type APIRequestContext } from "./fixtures/auth";
import { createTransaction, deleteTransaction } from "./fixtures/seed-data";
import { toastRegion } from "@platform/ui/test-support/toast";

/**
 * Personal transfers: money from a friend or relative that isn't rent.
 *
 * 1. Payment Review → "Personal transfer" on one card → that sender's other card clears too,
 *    both transactions are personal transfers in the DB, and the sender is listed as skipped.
 * 2. Transactions → mark a transaction from its panel, then "Not a personal transfer" puts
 *    back the status it had.
 * 3. Payment Review → "Stop skipping" a remembered sender removes it.
 */

interface SeededReview {
  id: string;
  transaction_id: string;
}

interface Sender {
  id: string;
  display_name: string;
}

async function seedRentReview(api: APIRequestContext, payerName: string, description: string): Promise<SeededReview> {
  const res = await api.post("/test/seed-attribution-review", {
    data: { channel: null, confidence: "unmatched", amount: "384.75", description, payer_name: payerName },
  });
  expect(res.ok(), `seed-attribution-review: ${res.status()} ${await res.text()}`).toBe(true);
  return res.json() as Promise<SeededReview>;
}

/** For cleanup: never throws, so it can't hide the test's own failure. */
async function deleteReview(api: APIRequestContext, review: SeededReview | undefined): Promise<void> {
  if (review) await api.delete(`/test/attribution-review/${review.id}`).catch(() => null);
}

async function listSenders(api: APIRequestContext): Promise<Sender[]> {
  const res = await api.get("/personal-transfer-senders");
  expect(res.ok(), `GET /personal-transfer-senders: ${res.status()}`).toBe(true);
  return res.json() as Promise<Sender[]>;
}

/** For cleanup: never throws. */
async function forgetSenderNamed(api: APIRequestContext, name: string): Promise<void> {
  const senders = await listSenders(api).catch(() => [] as Sender[]);
  for (const sender of senders.filter((s) => s.display_name === name)) {
    await api.delete(`/personal-transfer-senders/${sender.id}`).catch(() => null);
  }
}

async function statusOf(api: APIRequestContext, id: string): Promise<string> {
  const res = await api.get(`/transactions/${id}`);
  expect(res.ok(), `GET /transactions/${id}: ${res.status()}`).toBe(true);
  return ((await res.json()) as { status: string }).status;
}

test.describe("Personal transfers", () => {
  test("marking a Payment Review card clears that sender's other cards and remembers them", async ({
    authedPage: page,
    api,
  }) => {
    const runId = Date.now();
    const payer = `E2E Pal ${runId}`;
    let first: SeededReview | undefined;
    let second: SeededReview | undefined;

    try {
      first = await seedRentReview(api, payer, `E2E personal one ${runId}`);
      second = await seedRentReview(api, payer, `E2E personal two ${runId}`);
      await page.goto("/payment-review");

      const firstCard = page.getByTestId("attribution-review-item").filter({ hasText: `E2E personal one ${runId}` });
      const secondCard = page.getByTestId("attribution-review-item").filter({ hasText: `E2E personal two ${runId}` });
      await expect(firstCard).toBeVisible();
      await expect(secondCard).toBeVisible();

      await firstCard.getByRole("button", { name: "Personal transfer" }).click();

      await expect(
        toastRegion(page).getByText(
          `Marked as a personal transfer. I'll skip ${payer}'s payments from now on. I also cleared 1 more payment from them.`,
        ),
      ).toBeVisible();
      await expect(firstCard).toBeHidden();
      await expect(secondCard).toBeHidden();

      expect(await statusOf(api, first.transaction_id)).toBe("personal_transfer");
      expect(await statusOf(api, second.transaction_id)).toBe("personal_transfer");

      const senders = page.getByRole("region", { name: "Senders I skip" });
      await expect(senders.getByText(payer, { exact: true })).toBeVisible();
    } finally {
      await forgetSenderNamed(api, payer);
      await deleteReview(api, first);
      await deleteReview(api, second);
    }
  });

  test("a transaction marked from its panel goes back to the status it had", async ({ authedPage: page, api }) => {
    const vendor = `E2E Pal Txn ${Date.now()}`;
    const { id } = await createTransaction(api, {
      vendor,
      amount: "50.00",
      transaction_type: "income",
      category: "rental_revenue",
    });

    try {
      expect(await statusOf(api, id)).toBe("pending");
      await page.goto("/transactions");
      await page.getByRole("textbox", { name: "Filter by vendor", exact: true }).fill(vendor);
      const row = page.locator("tbody tr").filter({ hasText: vendor });
      await row.click();

      const panel = page.getByRole("dialog", { name: vendor, exact: true });
      await panel.getByRole("button", { name: "Mark as personal transfer" }).click();
      await expect(toastRegion(page).getByText("Marked as a personal transfer. It won't count towards your totals.")).toBeVisible();
      await expect.poll(() => statusOf(api, id)).toBe("personal_transfer");
      await expect(panel.getByText("This is a personal transfer. It doesn't count towards any total.")).toBeVisible();
      // While marked it can't be approved into the totals.
      await expect(panel.getByRole("button", { name: /^approve$/i })).toHaveCount(0);

      await panel.getByRole("button", { name: "Not a personal transfer" }).click();
      await expect(toastRegion(page).getByText("Got it, that's not a personal transfer.")).toBeVisible();
      await expect.poll(() => statusOf(api, id)).toBe("pending");
    } finally {
      await deleteTransaction(api, id).catch(() => null);
    }
  });

  test("stop skipping a remembered sender", async ({ authedPage: page, api }) => {
    const runId = Date.now();
    const payer = `E2E Pal Forget ${runId}`;
    let review: SeededReview | undefined;

    try {
      review = await seedRentReview(api, payer, `E2E personal forget ${runId}`);
      const marked = await api.put(`/transactions/${review.transaction_id}/personal-transfer`);
      expect(marked.ok(), `mark: ${marked.status()} ${await marked.text()}`).toBe(true);

      await page.goto("/payment-review");
      const senders = page.getByRole("region", { name: "Senders I skip" });
      await senders.getByRole("button", { name: `Stop skipping ${payer}` }).click();

      const dialog = page.getByRole("dialog", { name: `Stop skipping ${payer}?` });
      await dialog.getByRole("button", { name: "Stop skipping", exact: true }).click();

      await expect(
        toastRegion(page).getByText(`I'll stop skipping ${payer}. Their next payment will show up in Payment Review.`),
      ).toBeVisible();
      await expect(senders.getByText(payer, { exact: true })).toBeHidden();
      expect((await listSenders(api)).some((s) => s.display_name === payer)).toBe(false);
      // Payments already marked stay marked.
      expect(await statusOf(api, review.transaction_id)).toBe("personal_transfer");
    } finally {
      await forgetSenderNamed(api, payer);
      await deleteReview(api, review);
    }
  });
});
