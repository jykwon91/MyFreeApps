/**
 * No-backend E2E for the scenario path (/scenarios): it lists the learner's
 * language's scenarios in order and opens the chosen one; a learner at today's
 * cap is told before they start; a failed load (catalog or profile) says so and
 * Try again recovers; the loading skeleton lines up with the loaded list.
 */
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { AFTER_RESET, BEFORE_RESET, DAILY_LIMIT_AFTER_RESET_COPY, DAILY_LIMIT_COPY, LEARNER_TIME_ZONE, UNAVAILABLE_COPY } from "./constants/blockCopy";
import { LESSONS_LOAD_FAILED } from "./constants/onboardingCopy";
import { GET_PROFILE, GET_USAGE_TODAY, LIST_SCENARIOS } from "./constants/stubbedEndpoints";
import { PHONE_VIEWPORT, TABLET_VIEWPORT } from "./constants/viewports";
import { SCENARIOS } from "./fixtures/catalogFixtures";
import { expectSkeletonRowsLineUp } from "./fixtures/skeletonAlignment";
import { signedInTutor } from "./fixtures/signedInTutor";
import { CAP_REACHED, PLENTY_LEFT, TUTOR_OFF } from "./fixtures/tutorFixtures";

test.use({ timezoneId: LEARNER_TIME_ZONE });

test("lists the scenarios in path order for the learner's language, and opens the one picked", async ({ page }) => {
  const api = await signedInTutor(page);

  await page.goto("/scenarios");
  await expect(page.getByRole("heading", { name: "Practice Spanish" })).toBeVisible();
  const cards = page.getByRole("main").getByRole("listitem");
  await expect(cards).toHaveCount(SCENARIOS.length);
  for (const [index, scenario] of SCENARIOS.entries()) {
    await expect(cards.nth(index)).toContainText(`${scenario.order}.${scenario.title}`);
    await expect(cards.nth(index)).toContainText(scenario.goal);
  }
  expect(api.reads).toContain("/scenarios?language=es");
  await expect(page.getByText(/You've used today's practice time/)).toHaveCount(0);

  await page.getByRole("link", { name: /At the café/ }).click();
  await expect(page).toHaveURL(/\/practice\?scenario=cafe$/);
  await expect(page.getByRole("heading", { name: "At the café" })).toBeVisible();
});

for (const [label, now, copy] of [
  ["before", BEFORE_RESET, DAILY_LIMIT_COPY],
  ["after", AFTER_RESET, DAILY_LIMIT_AFTER_RESET_COPY],
] as const) {
  test(`a learner at today's cap (${label} the day's reset hour) is told before they pick a scenario`, async ({ page }) => {
    await page.clock.setFixedTime(now);
    await signedInTutor(page, { usage: CAP_REACHED });

    await page.goto("/scenarios");
    await expect(page.getByText(copy, { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: /Greetings/ })).toBeVisible();
  });
}

test("the cap notice on the scenario path lifts by itself when the reset passes with the page left open", async ({ page }) => {
  await page.clock.install({ time: BEFORE_RESET });
  const api = await signedInTutor(page, { usage: CAP_REACHED });

  await page.goto("/scenarios");
  await expect(page.getByText(DAILY_LIMIT_COPY, { exact: true })).toBeVisible();

  api.setUsage(PLENTY_LEFT);
  await page.clock.fastForward("09:01:00");
  await expect(page.getByText(/You've used today's practice time/)).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Greetings/ })).toBeVisible();
});

test("a learner is told the tutor is switched off before they pick a scenario", async ({ page }) => {
  await signedInTutor(page, { usage: TUTOR_OFF });

  await page.goto("/scenarios");
  await expect(page.getByText(UNAVAILABLE_COPY, { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /Greetings/ })).toBeVisible();
});

test("a failed usage load is said quietly, keeps the scenarios, and Try again shows the real notice", async ({ page }) => {
  const api = await signedInTutor(page, { usage: CAP_REACHED, failWith: [GET_USAGE_TODAY] });

  await page.goto("/scenarios");
  await expect(page.getByText("Couldn't check today's practice time.")).toBeVisible();
  await expect(page.getByRole("link", { name: /Greetings/ })).toBeVisible();

  api.stopFailing(GET_USAGE_TODAY);
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByText(/You've used today's practice time/)).toBeVisible();
  await expect(page.getByText("Couldn't check today's practice time.")).toHaveCount(0);
});

test("a language with no scenarios says so instead of showing an empty list", async ({ page }) => {
  await signedInTutor(page, { scenarios: [] });

  await page.goto("/scenarios");
  await expect(page.getByRole("heading", { name: "Practice Spanish" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "No scenarios yet" })).toBeVisible();
  await expect(page.getByText("Scenarios for this language will show up here.")).toBeVisible();
  await expect(page.getByRole("main").getByRole("listitem")).toHaveCount(0);
});

for (const failing of [LIST_SCENARIOS, GET_PROFILE]) {
  test(`a failed load (${failing}) says so instead of an empty path, and Try again recovers`, async ({ page }) => {
    const api = await signedInTutor(page, { failWith: [failing] });

    await page.goto("/scenarios");
    await expect(page.getByText(LESSONS_LOAD_FAILED)).toBeVisible();
    await expect(page.getByRole("link", { name: /Greetings/ })).toHaveCount(0);

    api.stopFailing(failing);
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page.getByRole("link", { name: /Greetings/ })).toBeVisible();
  });
}

test("while the scenarios load, each skeleton row sits exactly where the loaded row it stands in for does", async ({ page }) => {
  await expectSkeletonRowsLineUp(page);
});

test.describe("on a small phone", () => {
  test.use({ viewport: PHONE_VIEWPORT });

  test("each skeleton row still sits exactly where its loaded row does, wrapped lines and all", async ({ page }) => {
    await expectSkeletonRowsLineUp(page);
  });
});

test.describe("on a portrait tablet, beside the sidebar", () => {
  test.use({ viewport: TABLET_VIEWPORT });

  test("each skeleton row still sits exactly where its loaded row does", async ({ page }) => {
    await expectSkeletonRowsLineUp(page);
  });
});
