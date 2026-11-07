import type { Locator, Page } from "@playwright/test";

/**
 * The visible toast list. Radix also announces each toast in a hidden
 * role="status" element outside this region, so a page-wide text match finds
 * the message twice once that announcement lands.
 *
 * Matched by attribute, not getByRole: an open modal dialog marks everything
 * outside it aria-hidden, and role queries skip aria-hidden elements.
 */
export function toasts(page: Page): Locator {
  return page.locator('[role="region"][aria-label="Notifications"]');
}
