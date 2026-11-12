import type { Page } from "@playwright/test";

/** The toast region's line with exactly this message. */
export function toast(page: Page, message: string) {
  return page.getByRole("region", { name: "Notifications" }).getByText(message, { exact: true });
}

/**
 * Like toast(), for a toast shown while a modal dialog is open: a refused save,
 * or a success toast fired before the dialog closes. A modal Radix dialog marks
 * its siblings aria-hidden by design, and the toast region is one of them, so
 * the role query has to include hidden elements. Screen readers still hear the
 * message through Radix's separate announce region (role=status); the toast
 * fix on the other branch changes only stacking, so this helper stays needed.
 */
export function toastAboveModal(page: Page, message: string) {
  return page
    .getByRole("region", { name: "Notifications", includeHidden: true })
    .getByText(message, { exact: true });
}
