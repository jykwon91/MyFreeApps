/** No-backend E2E: an address that matches nothing shows the not-found page, with a way back. */
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { signedInTutor } from "./fixtures/signedInTutor";

test("an unknown address says the page wasn't found and offers Back to home", async ({ page }) => {
  await signedInTutor(page);
  await page.goto("/no-such-page");

  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  await expect(page.getByText("It may have moved or never existed.")).toBeVisible();
  await page.getByRole("link", { name: "Back to home" }).click();
  await expect(page).not.toHaveURL(/no-such-page/);
});
