import type { Page } from "@playwright/test";
import { expect } from "@platform/ui/test-support/crashGuard";
import type { ColorScheme } from "../types/ColorScheme";

/** The page is in `scheme`: the index.html init script put `.dark` on <html> or left it off. */
export async function expectColorScheme(page: Page, scheme: ColorScheme): Promise<void> {
  const html = page.locator("html");
  if (scheme === "dark") await expect(html).toHaveClass(/\bdark\b/);
  else await expect(html).not.toHaveClass(/\bdark\b/);
}
