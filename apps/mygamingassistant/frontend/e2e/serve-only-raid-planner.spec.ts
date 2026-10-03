/**
 * The group planner on the serve-only site (VITE_SERVE_ONLY=true) — the public deployment [Groups] on Raid: Edit
 * links to. Runs on its own serve-only dev server (playwright.serve-only.config.ts); no backend — the plan is the
 * route fixture in `fixtures/raidPlan.ts`.
 *
 * Run: npm run test:e2e:serve-only -- serve-only-raid-planner
 */
import { expect, test } from "@playwright/test";
import {
  PLANNER_AUTHORIZATION,
  PLANNER_HEADING,
  PLANNER_LINK,
  routePlan,
  smallPlanFixture,
} from "./fixtures/raidPlan";

test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: "ignoreErrors" });
});

test("the planner works on the serve-only site, with no sign-in anywhere", async ({ page }) => {
  const routes = await routePlan(page, smallPlanFixture());
  await page.goto(PLANNER_LINK);
  await expect(page.getByRole("heading", { level: 1, name: PLANNER_HEADING })).toBeVisible();
  await expect(page.getByRole("link", { name: /sign in/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /sign in/i })).toHaveCount(0);

  await page.getByRole("combobox", { name: "Move Fenn to" }).selectOption("slot:1:4");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Groups saved")).toBeVisible();
  expect(routes.saves()).toHaveLength(1);
  expect(new Set(routes.authorizations())).toEqual(new Set([PLANNER_AUTHORIZATION]));
});
