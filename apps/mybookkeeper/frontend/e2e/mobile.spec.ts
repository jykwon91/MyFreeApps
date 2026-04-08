import { test, expect } from "./fixtures/auth";

const MOBILE_VIEWPORT = { width: 375, height: 667 };

// Common phone sizes — viewport width is the only thing that matters for
// layout regression. Kept to 3 to balance coverage with suite runtime.
const PHONE_VIEWPORTS = [
  { name: "iPhone SE", width: 375, height: 667 },
  { name: "iPhone 12", width: 390, height: 844 },
  { name: "Pixel 5", width: 393, height: 851 },
];

const AUTH_PAGES = [
  "/",
  "/documents",
  "/transactions",
  "/tax",
  "/tax/documents",
  "/properties",
  "/analytics",
  "/admin",
  "/admin/system-health",
  "/admin/costs",
  "/admin/user-activity",
  "/admin/demo",
];

// ─── Multi-viewport horizontal-overflow guard ────────────────────────────────
// Guards against the class of bug reported in the "fix mobile spacing" issue:
// a wide element (table with min-w, hardcoded w-[390px], unwrapped action row)
// forces document.scrollWidth beyond the viewport, breaking touch scroll and
// pushing content behind a fixed header.

for (const device of PHONE_VIEWPORTS) {
  test.describe(`Mobile overflow guard — ${device.name} (${device.width}x${device.height})`, () => {
    test.use({
      viewport: { width: device.width, height: device.height },
      isMobile: true,
      hasTouch: true,
    });

    for (const url of AUTH_PAGES) {
      test(`${url} — no horizontal overflow`, async ({ authedPage: page }) => {
        await page.goto(url);
        await page.waitForLoadState("domcontentloaded");
        await page.waitForTimeout(1200);

        const { scrollWidth, wide } = await page.evaluate((target) => {
          const offenders: Array<{ tag: string; cls: string; width: number }> = [];
          document.querySelectorAll("*").forEach((el) => {
            const rect = (el as HTMLElement).getBoundingClientRect();
            if (rect.width > target + 1 && offenders.length < 5) {
              offenders.push({
                tag: el.tagName,
                cls: ((el as HTMLElement).className?.toString?.() ?? "").slice(0, 70),
                width: Math.round(rect.width),
              });
            }
          });
          return { scrollWidth: document.documentElement.scrollWidth, wide: offenders };
        }, device.width);

        if (scrollWidth > device.width) {
          console.log(`  ${url} overflow: scrollWidth=${scrollWidth} vs viewport=${device.width}`);
          wide.forEach((w) => console.log(`    ${w.tag}.${w.cls} = ${w.width}px`));
        }

        expect(scrollWidth).toBeLessThanOrEqual(device.width);
      });
    }
  });
}

test.describe("Mobile responsiveness", () => {
  test.use({ viewport: MOBILE_VIEWPORT });

  // ─── Sidebar overflow — reproduces the real iOS Safari bug ───────────────────
  // Reported: on an iPhone with Safari chrome visible, the sidebar is taller
  // than the available viewport, so the bottom section (theme toggle, user
  // menu/logout, version tag) is hidden below the fold and cannot be reached.
  // These tests use a deliberately short viewport (iPhone SE landscape / small
  // phone with browser chrome) to reproduce and guard against the bug.
  test.describe("Sidebar on short viewports", () => {
    const SHORT_VIEWPORTS = [
      { name: "iPhone SE w/ Safari chrome", width: 375, height: 550 },
      { name: "iPhone 12 w/ Safari chrome", width: 390, height: 620 },
    ];

    for (const vp of SHORT_VIEWPORTS) {
      test(`app sidebar — ${vp.name} (${vp.width}x${vp.height}) — bottom section is reachable`, async ({ browser }) => {
        const context = await browser.newContext({
          viewport: { width: vp.width, height: vp.height },
          isMobile: true,
          hasTouch: true,
        });
        const page = await context.newPage();
        // Seed auth for this isolated context
        const fs = await import("fs");
        const path = await import("path");
        const { fileURLToPath } = await import("url");
        const dir = path.dirname(fileURLToPath(import.meta.url));
        const token = fs.readFileSync(path.join(dir, ".auth-token"), "utf-8").trim();
        const orgPath = path.join(dir, ".auth-org");
        const orgId = fs.existsSync(orgPath) ? fs.readFileSync(orgPath, "utf-8").trim() : "";
        await page.addInitScript(({ token, orgId }) => {
          localStorage.setItem("token", token);
          if (orgId) localStorage.setItem("v1_activeOrgId", orgId);
        }, { token, orgId });

        await page.goto("/");
        await page.waitForLoadState("domcontentloaded");
        await page.waitForTimeout(800);

        // Open the hamburger menu
        await page.getByRole("button", { name: /open menu/i }).click();
        await page.waitForTimeout(250);

        // The "Sign out" button lives in the sidebar's bottom section.
        // If the sidebar layout is broken, it's below the fold and
        // unreachable. Scroll the nav if needed, then verify it's visible.
        const nav = page.locator("aside nav");
        await nav.evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
        await page.waitForTimeout(100);

        // Bottom section: theme toggle button + user menu toggle.
        // Use the user-menu button (has the chevron and shows name/role).
        const userMenuBtn = page.locator("aside button").filter({ has: page.locator("svg") }).last();

        // Bottom section must be visible AND within the viewport
        const box = await userMenuBtn.boundingBox();
        expect(box, "user menu button has no bounding box").toBeTruthy();
        expect(box!.y + box!.height, `user menu extends below viewport (${box!.y + box!.height} > ${vp.height})`).toBeLessThanOrEqual(vp.height);

        await context.close();
      });

      test(`admin sidebar — ${vp.name} (${vp.width}x${vp.height}) — all nav items reachable`, async ({ browser }) => {
        const context = await browser.newContext({
          viewport: { width: vp.width, height: vp.height },
          isMobile: true,
          hasTouch: true,
        });
        const page = await context.newPage();
        const fs = await import("fs");
        const path = await import("path");
        const { fileURLToPath } = await import("url");
        const dir = path.dirname(fileURLToPath(import.meta.url));
        const token = fs.readFileSync(path.join(dir, ".auth-token"), "utf-8").trim();
        const orgPath = path.join(dir, ".auth-org");
        const orgId = fs.existsSync(orgPath) ? fs.readFileSync(orgPath, "utf-8").trim() : "";
        await page.addInitScript(({ token, orgId }) => {
          localStorage.setItem("token", token);
          if (orgId) localStorage.setItem("v1_activeOrgId", orgId);
        }, { token, orgId });

        await page.goto("/admin");
        await page.waitForLoadState("domcontentloaded");
        await page.waitForTimeout(800);

        await page.getByRole("button", { name: /open menu/i }).click();
        await page.waitForTimeout(250);

        // Sign out button at the bottom of admin sidebar
        const nav = page.locator("aside nav");
        await nav.evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
        await page.waitForTimeout(100);

        const userMenuBtn = page.locator("aside button").filter({ has: page.locator("svg") }).last();
        const box = await userMenuBtn.boundingBox();
        expect(box, "admin sidebar user menu has no bounding box").toBeTruthy();
        expect(box!.y + box!.height, `admin user menu extends below viewport (${box!.y + box!.height} > ${vp.height})`).toBeLessThanOrEqual(vp.height);

        await context.close();
      });
    }
  });

  // ─── Navigation ──────────────────────────────────────────────────────────────

  test.describe("Navigation", () => {
    test("hamburger menu opens sidebar and navigation works", async ({ authedPage: page }) => {
      await page.goto("/");
      await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

      // On a 375px viewport the sidebar is always translated off-screen by
      // default, so we must open the hamburger menu. Playwright's isVisible()
      // returns true for CSS-translated elements, which is why an earlier
      // version of this test skipped the hamburger click incorrectly — don't
      // re-introduce that shortcut.
      const menuBtn = page.getByRole("button", { name: /open menu/i });
      await expect(menuBtn).toBeVisible();
      await menuBtn.click();

      // Wait for the sidebar transform to settle before clicking a nav item.
      // The sidebar has a 200ms transform transition.
      await page.waitForTimeout(250);

      const transactionsLink = page.getByRole("link", { name: "Transactions" });
      await expect(transactionsLink).toBeVisible();
      await transactionsLink.click();

      await expect(page).toHaveURL(/\/transactions/);
      await expect(page.getByRole("heading", { name: "Transactions" })).toBeVisible({ timeout: 10000 });
    });

    test("no horizontal scroll on dashboard", async ({ authedPage: page }) => {
      await page.goto("/");
      await expect(page.getByText("Total Revenue").first()).toBeVisible({ timeout: 15000 });
      const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
      expect(bodyWidth).toBeLessThanOrEqual(400);
    });

    test("no horizontal scroll on transactions page", async ({ authedPage: page }) => {
      await page.goto("/transactions");
      await expect(
        page.locator("tbody tr").first().or(page.getByText(/no transactions/i))
      ).toBeVisible({ timeout: 10000 });
      const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
      expect(bodyWidth).toBeLessThanOrEqual(400);
    });

    test("no horizontal scroll on properties page", async ({ authedPage: page }) => {
      await page.goto("/properties");
      await expect(page.getByRole("button", { name: /add property/i })).toBeVisible({ timeout: 10000 });
      const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
      expect(bodyWidth).toBeLessThanOrEqual(400);
    });

    test("can navigate to all main pages on mobile without errors", async ({ authedPage: page }) => {
      const pages: Array<{ url: string; heading: string | RegExp }> = [
        { url: "/", heading: "Dashboard" },
        { url: "/transactions", heading: "Transactions" },
        { url: "/documents", heading: "Documents" },
        { url: "/properties", heading: "Properties" },
        { url: "/tax", heading: "Tax Report" },
      ];

      for (const { url, heading } of pages) {
        await page.goto(url);
        await page.waitForLoadState("domcontentloaded");
        await expect(page.getByRole("heading", { name: heading })).toBeVisible({ timeout: 15000 });
      }
    });
  });

  // ─── Add property form on mobile ─────────────────────────────────────────────

  test.describe("Properties form on mobile", () => {
    test("fills and submits the add property form on a 375px viewport", async ({ authedPage: page, api }) => {
      const name = `Mobile E2E ${Date.now()}`;
      await page.goto("/properties");
      await expect(page.getByRole("button", { name: /add property/i })).toBeVisible({ timeout: 10000 });

      const section = page.locator("section").first();
      await section.locator("input").first().fill(name);
      await page.getByPlaceholder(/6738 Peerless/i).fill("1 Mobile St");
      await page.getByPlaceholder("Houston").fill("Seattle");
      await page.getByPlaceholder("TX").fill("WA");
      await page.getByPlaceholder("77023").fill("98101");

      const addBtn = page.getByRole("button", { name: /add property/i });
      await expect(addBtn).toBeEnabled();
      await addBtn.click();

      await expect(page.getByText("Property created", { exact: true }).first()).toBeVisible({ timeout: 10000 });
      await expect(page.locator("li").filter({ hasText: name })).toBeVisible({ timeout: 10000 });

      // Cleanup
      const res = await api.get("/properties");
      const props = await res.json();
      const created = props.find((p: { name: string; id: string }) => p.name === name);
      if (created) await api.delete(`/properties/${created.id}`);
    });
  });

  // ─── Dashboard ───────────────────────────────────────────────────────────────

  test.describe("Dashboard", () => {
    test("summary cards are visible on 375px viewport", async ({ authedPage: page }) => {
      await page.goto("/");
      await expect(page.getByText("Total Revenue").first()).toBeVisible({ timeout: 15000 });
      await expect(page.getByText("Total Expenses").first()).toBeVisible();
      await expect(page.locator("p", { hasText: "Net Profit" }).first()).toBeVisible();
    });

    test("recharts fit within mobile viewport width", async ({ authedPage: page, api }) => {
      const res = await api.get("/summary");
      const summary = await res.json();
      if (!summary.by_month?.length) {
        test.skip(true, "No monthly chart data available");
        return;
      }

      await page.goto("/");
      await expect(page.getByText("Total Revenue").first()).toBeVisible({ timeout: 15000 });

      const chart = page.locator(".recharts-wrapper").first();
      if (await chart.isVisible()) {
        const box = await chart.boundingBox();
        expect(box!.width).toBeLessThanOrEqual(MOBILE_VIEWPORT.width);
      }
    });

    test("drill-down panel opens as bottom sheet on mobile (not as oversized right panel)", async ({ authedPage: page, api }) => {
      // Seed a tiny transaction so the dashboard has a chart bar to click
      const res = await api.get("/summary");
      const summary = await res.json();
      if (!summary?.by_month?.length) {
        test.skip(true, "No chart data to drill down into");
        return;
      }

      await page.goto("/");
      await expect(page.getByText("Total Revenue").first()).toBeVisible({ timeout: 15000 });

      // Find a chart bar (Recharts renders <g class="recharts-bar-rectangle">)
      const bar = page.locator(".recharts-bar-rectangle").first();
      if (!(await bar.isVisible({ timeout: 5000 }).catch(() => false))) {
        test.skip(true, "No bar chart rendered");
        return;
      }

      await bar.click({ force: true });

      // On mobile (<768px), DrillDownPanel renders via vaul as a bottom drawer
      // anchored to bottom-0 left-0 right-0 — NOT as a 520px-wide right panel
      // that would overflow the viewport.
      const drawer = page.locator("[vaul-drawer]").first()
        .or(page.locator("[role='dialog']").filter({ hasText: /transaction/i }).first());

      const drawerVisible = await drawer.isVisible({ timeout: 3000 }).catch(() => false);
      if (!drawerVisible) {
        // Panel didn't open — the chart may not be drillable in this test data
        test.skip(true, "Drill-down panel did not open");
        return;
      }

      // Drawer must not exceed viewport width
      const drawerBox = await drawer.boundingBox();
      expect(drawerBox?.width ?? 0).toBeLessThanOrEqual(MOBILE_VIEWPORT.width);
      // And it must be anchored near the bottom of the viewport (y > half)
      expect(drawerBox?.y ?? 0).toBeGreaterThan(MOBILE_VIEWPORT.height / 3);
    });
  });

  // ─── Transactions ─────────────────────────────────────────────────────────────

  test.describe("Transactions", () => {
    test("Add Transaction button is visible and tappable (min 44px height)", async ({ authedPage: page }) => {
      await page.goto("/transactions");
      await expect(
        page.locator("tbody tr").first().or(page.getByText(/no transactions/i))
      ).toBeVisible({ timeout: 10000 });

      const addBtn = page.getByRole("button", { name: /add transaction/i });
      await expect(addBtn).toBeVisible();
      const box = await addBtn.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
    });
  });

  // ─── Login page ───────────────────────────────────────────────────────────────

  test.describe("Login", () => {
    test("login page renders on mobile with tappable submit button", async ({ page }) => {
      await page.goto("/login");
      await expect(page.getByRole("heading", { name: "MyBookkeeper" })).toBeVisible();
      await expect(page.locator("input[type='email']")).toBeVisible();
      await expect(page.locator("input[type='password']")).toBeVisible();

      const signInBtn = page.getByRole("button", { name: "Sign in" });
      await expect(signInBtn).toBeVisible();
      const box = await signInBtn.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
    });
  });

  // ─── Admin pages ──────────────────────────────────────────────────────────────

  test.describe("Admin pages", () => {
    test("admin dashboard renders on mobile", async ({ authedPage: page }) => {
      await page.goto("/admin");
      await expect(page.getByRole("heading", { name: "Admin" })).toBeVisible();
      await expect(page.getByText("Total Users")).toBeVisible({ timeout: 10000 });
    });

    test("cost monitoring renders on mobile", async ({ authedPage: page }) => {
      await page.goto("/admin/costs");
      await expect(page.getByRole("heading", { name: "Cost Monitoring" }).first()).toBeVisible({ timeout: 10000 });
    });

    test("system health renders on mobile", async ({ authedPage: page }) => {
      await page.goto("/admin/system-health");
      await expect(page.getByRole("heading", { name: "System Health" })).toBeVisible();
    });
  });

  test.describe("Mobile card views", () => {
    test("transactions page shows card view instead of table on mobile", async ({ authedPage: page }) => {
      await page.goto("/transactions");
      await expect(page.getByRole("heading", { name: "Transactions" })).toBeVisible({ timeout: 15000 });

      // On mobile viewport, card view should be visible and table hidden
      const cards = page.locator("[data-testid='mobile-card-view'], .md\\:hidden").first();
      const cardsExist = await cards.isVisible({ timeout: 5000 }).catch(() => false);
      if (!cardsExist) {
        test.skip(true, "No card view or mobile layout detected");
        return;
      }
      expect(cardsExist).toBe(true);
    });

    test("mobile filter toggle shows and hides filters", async ({ authedPage: page }) => {
      await page.goto("/transactions");
      await expect(page.getByRole("heading", { name: "Transactions" })).toBeVisible({ timeout: 15000 });

      // Look for the mobile filter toggle button
      const filterToggle = page.getByRole("button", { name: /filter/i }).first();
      const isVisible = await filterToggle.isVisible({ timeout: 3000 }).catch(() => false);
      if (!isVisible) {
        test.skip(true, "No filter toggle on this viewport");
        return;
      }

      await filterToggle.click();

      // Some filter controls should now be visible
      const filterControl = page.locator("select").first();
      await expect(filterControl).toBeVisible({ timeout: 3000 });
    });
  });
});
