import { test, expect } from "./fixtures/auth";
import type { Page } from "@playwright/test";

/**
 * E2E tests for dismissable info banners across the app.
 *
 * Each page has a blue info banner shown to first-time users.
 * Clicking the X dismiss button hides it and persists in localStorage.
 */

const BANNER_PAGES: Array<{
  path: string;
  localStorageKey: string;
  headingText: string;
  bannerSnippet: RegExp;
}> = [
  {
    path: "/properties",
    localStorageKey: "props-info-dismissed",
    headingText: "Properties",
    bannerSnippet: /Properties let me know where each expense belongs/,
  },
  {
    path: "/tax-returns",
    localStorageKey: "tax-returns-info-dismissed",
    headingText: "Tax Returns",
    bannerSnippet: /A tax return here is a workspace/,
  },
  {
    path: "/tax",
    localStorageKey: "tax-report-info-dismissed",
    headingText: "Tax Report",
    bannerSnippet: /This is your tax summary/,
  },
  {
    path: "/reconciliation",
    localStorageKey: "recon-info-dismissed",
    headingText: "Reconciliation",
    bannerSnippet: /Reconciliation compares what your rental platform/,
  },
  {
    path: "/analytics",
    localStorageKey: "analytics-info-dismissed",
    headingText: "Analytics",
    bannerSnippet: /I track your utility costs over time/,
  },
  {
    path: "/integrations",
    localStorageKey: "integrations-info-dismissed",
    headingText: "Integrations",
    bannerSnippet: /Connect Gmail and I/,
  },
  {
    path: "/security",
    localStorageKey: "security-info-dismissed",
    headingText: "Security",
    bannerSnippet: /Two-factor authentication adds an extra layer/,
  },
];

async function clearAllBannerKeys(page: Page): Promise<void> {
  await page.evaluate((keys) => {
    for (const key of keys) {
      localStorage.removeItem(key);
    }
  }, BANNER_PAGES.map((p) => p.localStorageKey));
}

test.describe("Info Banners — Visibility & Dismiss", () => {
  for (const { path, localStorageKey, headingText, bannerSnippet } of BANNER_PAGES) {
    test(`${headingText}: shows info banner on first visit`, async ({ authedPage: page }) => {
      // Clear any previous dismiss state
      await page.evaluate((key) => localStorage.removeItem(key), localStorageKey);

      await page.goto(path);
      await expect(page.getByText(bannerSnippet)).toBeVisible({ timeout: 10000 });
    });

    test(`${headingText}: dismiss button hides banner and persists`, async ({ authedPage: page }) => {
      // Clear any previous dismiss state
      await page.evaluate((key) => localStorage.removeItem(key), localStorageKey);

      await page.goto(path);
      await expect(page.getByText(bannerSnippet)).toBeVisible({ timeout: 10000 });

      // Click the dismiss button
      await page.getByLabel("Dismiss").click();

      // Banner should disappear
      await expect(page.getByText(bannerSnippet)).not.toBeVisible();

      // localStorage should be set
      const stored = await page.evaluate((key) => localStorage.getItem(key), localStorageKey);
      expect(stored).toBe("1");
    });

    test(`${headingText}: dismissing does not affect other pages' banners`, async ({ authedPage: page }) => {
      // The useDismissable hook gives each page an independent storage key.
      // Dismissing one page's banner must not dismiss any other page's banner.
      await clearAllBannerKeys(page);

      await page.goto(path);
      await expect(page.getByText(bannerSnippet)).toBeVisible({ timeout: 10000 });
      await page.getByLabel("Dismiss").click();
      await expect(page.getByText(bannerSnippet)).not.toBeVisible();

      // Verify all OTHER keys remain unset in localStorage
      const otherKeysState = await page.evaluate((keys) => {
        const state: Record<string, string | null> = {};
        for (const key of keys) {
          state[key] = localStorage.getItem(key);
        }
        return state;
      }, BANNER_PAGES.filter((p) => p.localStorageKey !== localStorageKey).map((p) => p.localStorageKey));

      for (const [key, value] of Object.entries(otherKeysState)) {
        expect(value, `${key} should be null after dismissing ${localStorageKey}`).toBeNull();
      }
    });

    test(`${headingText}: banner stays hidden after page reload`, async ({ authedPage: page }) => {
      // Set the dismiss key before navigating
      await page.evaluate((key) => localStorage.setItem(key, "1"), localStorageKey);

      await page.goto(path);

      // Wait for page to load — check heading is visible
      if (headingText === "Security") {
        await expect(page.getByRole("heading", { name: headingText })).toBeVisible({ timeout: 10000 });
      } else {
        await expect(page.getByText(headingText).first()).toBeVisible({ timeout: 10000 });
      }

      // Banner should not be present
      await expect(page.getByText(bannerSnippet)).not.toBeVisible();
    });
  }
});

test.describe("Info Banners — Empty States", () => {
  test("Properties: shows actionable empty state when no properties", async ({ authedPage: page }) => {
    await page.goto("/properties");
    await expect(page.getByText("Properties").first()).toBeVisible({ timeout: 10000 });

    const emptyMsg = page.getByText(/Add your first property above/);
    const isEmpty = await emptyMsg.isVisible().catch(() => false);
    if (!isEmpty) {
      test.skip(true, "User has properties — empty state not shown");
      return;
    }
    await expect(emptyMsg).toContainText("organize your transactions");
  });
});
