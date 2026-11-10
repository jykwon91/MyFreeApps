import type { APIRequestContext, Page } from "@playwright/test";
import { test, expect } from "./fixtures/auth";
import { cleanUp } from "./fixtures/cleanup";
import { createProperty, deleteProperty, deleteTransaction } from "./fixtures/seed-data";
import { toasts } from "./fixtures/toasts";

/**
 * Bank statement import from the Transactions page: pick a small Chase CSV,
 * import it, see the summary toast, confirm the rows through the API, then
 * delete what the import created. The dialog closes on success, so the
 * summary is the toast.
 */

const MARKER = "E2E BANKIMPORT";

interface ListedTransaction {
  id: string;
  vendor: string | null;
  amount: string;
  property_id: string | null;
}

function chaseCsv(runId: number): string {
  return [
    "Details,Posting Date,Description,Amount,Type,Balance",
    `DEBIT,03/02/2026,${MARKER} SHELL ${runId},-40.00,DEBIT_CARD,1000.00`,
    `CREDIT,03/03/2026,${MARKER} RENT ${runId},1200.00,ACH_CREDIT,2200.00`,
  ].join("\n");
}

async function listCreated(api: APIRequestContext, runId: number): Promise<ListedTransaction[]> {
  const res = await api.get("/transactions", { params: { vendor: MARKER, limit: 200 } });
  expect(res.ok()).toBe(true);
  const all = (await res.json()) as ListedTransaction[];
  return all.filter((t) => (t.vendor ?? "").toUpperCase().includes(String(runId)));
}

async function deleteCreated(api: APIRequestContext, runId: number): Promise<void> {
  for (const row of await listCreated(api, runId)) await deleteTransaction(api, row.id);
}

async function importCsv(page: Page, runId: number, propertyName?: string): Promise<void> {
  await page.goto("/transactions");
  await page.getByRole("button", { name: "Import", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Import Bank Statement" });
  await expect(dialog).toBeVisible();
  const submit = dialog.getByRole("button", { name: "Import", exact: true });
  await expect(submit).toBeDisabled();

  await dialog.locator('input[type="file"][accept=".csv"]').setInputFiles({
    name: "e2e-statement.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(chaseCsv(runId)),
  });
  await expect(dialog.getByText("e2e-statement.csv")).toBeVisible();
  if (propertyName) await dialog.getByRole("combobox").selectOption({ label: propertyName });
  await submit.click();

  await expect(toasts(page).getByText("Imported 2 transaction(s)")).toBeVisible({ timeout: 15000 });
  await expect(dialog).toBeHidden();
}

test("importing a bank statement shows the summary and creates the rows", async ({ authedPage: page, api }) => {
  const runId = Date.now();
  try {
    await importCsv(page, runId);
    const rows = await listCreated(api, runId);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => Number(r.amount)).sort((a, b) => a - b)).toEqual([40, 1200]);
    expect(rows.every((r) => r.property_id === null)).toBe(true);
  } finally {
    await cleanUp(() => deleteCreated(api, runId));
  }
  expect(await listCreated(api, runId)).toHaveLength(0);
});

test("importing with a property files every created row under it", async ({ authedPage: page, api }) => {
  // Tests run in parallel, so the id must differ from the other test's even within the same millisecond.
  const runId = Date.now() + 1;
  const property = await createProperty(api, { name: `E2E Import Property ${runId}` });
  try {
    await importCsv(page, runId, `E2E Import Property ${runId}`);
    const rows = await listCreated(api, runId);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.property_id === property.id)).toBe(true);
  } finally {
    await cleanUp(
      () => deleteCreated(api, runId),
      () => deleteProperty(api, property.id),
    );
  }
});
