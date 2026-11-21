/**
 * No-backend E2E for the company picker in Add application's manual entry: it is a real combobox
 * (found by role), arrow keys move the active option it announces, and Enter picks that company.
 */
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { json } from "@platform/ui/test-support/mockResponse";
import { stubSignedInShell } from "@platform/ui/test-support/mockSession";
import { mockCompany } from "./fixtures/mockData";

const ACME = mockCompany({ id: "00000000-0000-0000-0000-0000000000c1", name: "Acme Corp" });
const ACORN = mockCompany({ id: "00000000-0000-0000-0000-0000000000c2", name: "Acorn Labs", primary_domain: "acorn.io" });

test("the company picker is a combobox whose arrows move the active option", async ({ page }) => {
  await stubSignedInShell(page);
  await page.route(/\/api\/companies(\?|$)/, (route) => route.fulfill(json({ items: [ACME, ACORN], total: 2 })));
  await page.route(/\/api\/applications(\?|$)/, (route) => route.fulfill(json({ items: [], total: 0 })));

  await page.goto("/applications");
  await page.getByRole("button", { name: "Add application" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Add application" });
  await dialog.getByText(/adding manually\? type a company name/i).click();

  const combobox = dialog.getByRole("combobox", { name: "Company name" });
  await combobox.fill("ac");
  await expect(combobox).toHaveAttribute("aria-expanded", "true");
  await expect(dialog.getByRole("option")).toHaveCount(3);

  await combobox.press("ArrowDown");
  const first = dialog.getByRole("option", { name: /acme corp/i });
  await expect(first).toHaveAttribute("aria-selected", "true");
  await expect(combobox).toHaveAttribute("aria-activedescendant", (await first.getAttribute("id")) ?? "");

  await combobox.press("ArrowDown");
  await expect(dialog.getByRole("option", { name: /acorn labs/i })).toHaveAttribute("aria-selected", "true");

  await combobox.press("Enter");
  await expect(dialog.getByText(/review and adjust before saving/i)).toBeVisible();
});
