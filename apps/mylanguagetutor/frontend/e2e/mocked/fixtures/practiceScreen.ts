/** Moves on the practice screen's typed-answer path. */
import { expect, type Locator, type Page } from "@playwright/test";
import { GOALS_LABEL, TYPING_ONLY_LABEL } from "../constants/practiceLabels";

/** Opens a scenario the way a learner does: from its card on /scenarios, then waits for its heading. */
export async function openPractice(page: Page, title: string): Promise<void> {
  await page.goto("/scenarios");
  await page
    .getByRole("main")
    .getByRole("link")
    .filter({ has: page.getByText(title, { exact: true }) })
    .click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
}

/** Types an answer into the box labelled `label` and presses Send. */
export async function sendTyped(page: Page, text: string, label = TYPING_ONLY_LABEL): Promise<void> {
  await page.getByLabel(label).fill(text);
  await page.getByRole("button", { name: "Send", exact: true }).click();
}

/** One goal in the scenario's goal list, which says "(done)" once met. */
export function goal(page: Page, text: string): Locator {
  return page.getByRole("list", { name: GOALS_LABEL }).getByRole("listitem").filter({ hasText: text });
}
