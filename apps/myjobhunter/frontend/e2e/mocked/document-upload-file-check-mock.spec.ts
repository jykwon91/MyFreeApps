/**
 * No-backend E2E for the Add Document dialog refusing a file the server would refuse.
 *
 * Verifies a wrong type and an over-size file each show the problem under the file field the moment
 * they are chosen, and that Upload sends nothing; a good file then uploads.
 */
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { json } from "@platform/ui/test-support/mockResponse";
import { stubSignedInShell } from "@platform/ui/test-support/mockSession";

const DOCUMENTS_ENDPOINT = /\/api\/documents(\?|$)/;
const UPLOAD_ENDPOINT = /\/api\/documents\/upload/;
const OVER_LIMIT_BYTES = 25 * 1024 * 1024 + 1;

let uploads = 0;

test.beforeEach(async ({ page }) => {
  uploads = 0;
  await stubSignedInShell(page);
  await page.route(DOCUMENTS_ENDPOINT, (route) => route.fulfill(json({ items: [], total: 0 })));
  await page.route(UPLOAD_ENDPOINT, (route) => {
    uploads += 1;
    return route.fulfill(json({ id: "d1" }, 201));
  });
  await page.goto("/documents");
  await page.getByRole("button", { name: "Add document" }).click({ timeout: 15000 });
  await page.getByLabel("Title").fill("My Resume");
});

test("a wrong type of file is refused inline and never sent", async ({ page }) => {
  await page.getByLabel(/^File/).setInputFiles({ name: "photo.png", mimeType: "image/png", buffer: Buffer.from("x") });

  const dialog = page.getByRole("dialog", { name: "Add Document" });
  await expect(dialog.getByRole("alert")).toHaveText("That type of file can't be uploaded. Choose a PDF, DOCX, or TXT file.");
  await dialog.getByRole("button", { name: "Upload" }).click();
  expect(uploads).toBe(0);
});

test("a file over 25 MB is refused inline and never sent", async ({ page }) => {
  await page.getByLabel(/^File/).setInputFiles({ name: "big.pdf", mimeType: "application/pdf", buffer: Buffer.alloc(OVER_LIMIT_BYTES) });

  const dialog = page.getByRole("dialog", { name: "Add Document" });
  await expect(dialog.getByRole("alert")).toHaveText("That file is over 25 MB. Choose a smaller one.");
  await dialog.getByRole("button", { name: "Upload" }).click();
  expect(uploads).toBe(0);
});

test("a good file clears the message and uploads", async ({ page }) => {
  const dialog = page.getByRole("dialog", { name: "Add Document" });
  await page.getByLabel(/^File/).setInputFiles({ name: "photo.png", mimeType: "image/png", buffer: Buffer.from("x") });
  await expect(dialog.getByRole("alert")).toBeVisible();

  await page.getByLabel(/^File/).setInputFiles({ name: "resume.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4") });
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Upload" }).click();

  await expect.poll(() => uploads).toBe(1);
});
