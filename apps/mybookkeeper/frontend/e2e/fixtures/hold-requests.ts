import type { Page } from "@playwright/test";

/**
 * Holds requests whose URL matches ``matches`` until the returned release is
 * called, so a loading skeleton stays up for exactly as long as a test needs.
 * Prefer this to a fixed delay: a held request can't race a navigation.
 */
export async function holdRequests(page: Page, matches: (url: URL) => boolean): Promise<() => void> {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(matches, async (route) => {
    await gate;
    await route.continue();
  });
  return release;
}
