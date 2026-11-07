import { test, expect } from "./fixtures/auth";
import { holdRequests } from "./fixtures/hold-requests";
import { APP_PAGES, type AppPage } from "./fixtures/app-pages";

// The narrowest common phone: a skeleton that fits here fits the others.
const PHONE = { width: 375, height: 667 };

// Pages with no loading skeleton of their own: forms and pages that render
// from data the app shell already has.
const PAGES_WITHOUT_SKELETONS = new Set<AppPage>(["/leases/new", "/members", "/reconciliation", "/security", "/admin/user-activity"]);

// The overflow guard in mobile.spec.ts measures loaded pages; this one
// measures the skeleton a phone sees first.
const PAGES_WITH_SKELETONS = APP_PAGES.filter((url) => !PAGES_WITHOUT_SKELETONS.has(url));

// Session and workspace lookups let the app shell render; everything else is
// held so the page stays on its skeleton.
const SHELL_REQUEST = /^\/api\/(users\/me|auth\/|organizations)/;

function isPageRequest(url: URL): boolean {
  return url.pathname.startsWith("/api/") && !SHELL_REQUEST.test(url.pathname);
}

test.describe("Mobile — loading skeletons fit the screen", () => {
  test.use({ viewport: PHONE, isMobile: true, hasTouch: true });

  for (const url of PAGES_WITH_SKELETONS) {
    test(`${url} — skeleton has no horizontal overflow`, async ({ authedPage: page }) => {
      await holdRequests(page, isPageRequest);
      // The app shell has its own placeholders; a held page request proves the
      // page itself mounted, so what's measured is its skeleton.
      const pageRequest = page.waitForRequest((req) => isPageRequest(new URL(req.url())));
      try {
        await page.goto(url);
        await pageRequest;
        expect(new URL(page.url()).pathname).toBe(url);
        await expect(page.locator(".animate-pulse").first()).toBeVisible({ timeout: 15000 });

        const { scrollWidth, offenders } = await page.evaluate((width) => {
          const wide: string[] = [];
          document.querySelectorAll("body *").forEach((el) => {
            const right = el.getBoundingClientRect().right;
            if (right > width + 1 && wide.length < 5 && getComputedStyle(el).position !== "fixed") {
              wide.push(`${el.tagName.toLowerCase()}.${el.className.toString().slice(0, 60)} (right edge ${Math.round(right)}px)`);
            }
          });
          return { scrollWidth: document.documentElement.scrollWidth, offenders: wide };
        }, PHONE.width);

        expect(scrollWidth, `wider than the screen: ${offenders.join(" | ")}`).toBeLessThanOrEqual(PHONE.width);
      } finally {
        // The page doesn't need its data after the measurement.
        await page.unrouteAll({ behavior: "ignoreErrors" });
      }
    });
  }
});
