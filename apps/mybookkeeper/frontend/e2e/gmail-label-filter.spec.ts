/**
 * The "Only sync emails with label" filter on the Integrations page: saving it,
 * clearing it, and the API behind it. Each describe block has its own fresh
 * organization; the connected one gets Gmail through /test/seed-gmail-integration.
 */
import { test, expect, type APIRequestContext } from "@playwright/test";
import { seededOrg } from "./fixtures/seeded-org";
import { toastRegion } from "@platform/ui/test-support/toast";

interface GmailIntegration {
  provider: string;
  gmail_label?: string | null;
}

async function savedLabel(api: APIRequestContext): Promise<string | null | undefined> {
  const res = await api.get("/integrations");
  expect(res.status(), await res.text()).toBe(200);
  const gmail = ((await res.json()) as GmailIntegration[]).find((i) => i.provider === "gmail");
  return gmail?.gmail_label;
}

test.describe("Gmail label filter — connected", () => {
  const org = seededOrg("gmail-label", async (api) => {
    const res = await api.post("/test/seed-gmail-integration", { data: {} });
    expect(res.status(), await res.text()).toBe(204);
  });

  test("saving a label limits syncing to it, and clearing it syncs everything again", async ({ page }) => {
    await org().signIn(page);
    await page.goto("/integrations");
    const input = page.getByPlaceholder(/e\.g\. receipts/i);
    const save = page.getByRole("button", { name: /^save$/i });
    await expect(page.getByText("Leave empty to sync all emails")).toBeVisible({ timeout: 15000 });

    await input.fill("  Receipts ");
    await save.click();

    await expect(toastRegion(page)).toContainText(`Got it, I'll only sync emails with the "Receipts" label`);
    await expect(page.getByText(`Currently filtering by: "Receipts"`)).toBeVisible();
    expect(await savedLabel(org().api)).toBe("Receipts");
    await page.reload();
    await expect(input).toHaveValue("Receipts", { timeout: 15000 });
    await expect(page.getByText(`Currently filtering by: "Receipts"`)).toBeVisible();
    await expect(save).toBeDisabled();

    await input.fill("");
    await save.click();

    await expect(toastRegion(page)).toContainText("Label filter cleared - I'll sync all emails now");
    await expect(page.getByText("Leave empty to sync all emails")).toBeVisible();
    expect(await savedLabel(org().api)).toBeNull();
  });

  test("a label longer than Gmail allows is rejected and nothing is saved", async () => {
    const res = await org().api.patch("/integrations/gmail/label", { data: { label: "x".repeat(226) } });

    expect(res.status()).toBe(422);
    expect(await savedLabel(org().api)).toBeNull();
  });
});

test.describe("Gmail label filter — not connected", () => {
  const org = seededOrg("gmail-label-none");

  test("saving a label without Gmail connected is a 404", async () => {
    const res = await org().api.patch("/integrations/gmail/label", { data: { label: "Receipts" } });

    expect(res.status()).toBe(404);
  });
});
