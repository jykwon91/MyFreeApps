/**
 * Finds toasts in the shared Toaster's "Notifications" region. For E2E tests only.
 *
 * Scope to the region rather than matching text page-wide: Radix also announces
 * each toast in a hidden role="status" element outside it, so a page-wide match
 * finds the message twice once that announcement lands.
 */
import type { Locator, Page } from "@playwright/test";

const TOAST_REGION_NAME = "Notifications";

/**
 * The toast region, found whether or not a modal dialog is open. A modal Radix
 * dialog marks its siblings aria-hidden by design, and the toast region is one
 * of them, so the role query has to include hidden elements. Screen readers
 * still hear the message through Radix's separate announce region.
 */
export function toastRegion(page: Page): Locator {
  return page.getByRole("region", { name: TOAST_REGION_NAME, exact: true, includeHidden: true });
}

/** The toast region's line with exactly this message, while no modal dialog is open. */
export function toast(page: Page, message: string): Locator {
  return page.getByRole("region", { name: TOAST_REGION_NAME, exact: true }).getByText(message, { exact: true });
}

/**
 * Like toast(), for a toast shown while a modal dialog is open: a refused save,
 * or a success toast fired before the dialog closes.
 */
export function toastAboveModal(page: Page, message: string): Locator {
  return toastRegion(page).getByText(message, { exact: true });
}
