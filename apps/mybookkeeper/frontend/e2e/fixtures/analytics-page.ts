import { expect, type Locator, type Page } from "@playwright/test";
import type { UtilityCardTotals } from "./utility-card-totals";

/** Each per-type summary card's label, with the totals key it shows. */
export const TYPE_CARDS: readonly (readonly [string, keyof UtilityCardTotals])[] = [
  ["Electricity", "electricity"],
  ["Water", "water"],
  ["Gas", "gas"],
  ["Internet", "internet"],
  ["Trash", "trash"],
  ["Sewer", "sewer"],
];

export function summary(page: Page): Locator {
  return page.getByRole("region", { name: "Utility spend summary" });
}

/** The amount on the summary card with this label. */
export function cardAmount(page: Page, label: string): Locator {
  return summary(page).getByText(label, { exact: true }).locator("xpath=following-sibling::p");
}

export function trendsChart(page: Page): Locator {
  return page.getByLabel(/^Utility spend trends over/);
}

export function xAxisLabels(page: Page): Locator {
  return trendsChart(page).locator(".recharts-xAxis-tick-labels .recharts-cartesian-axis-tick-label");
}

export async function openAnalytics(page: Page, query = ""): Promise<void> {
  await page.goto(`/analytics${query}`);
  await expect(page.getByRole("heading", { name: "Analytics" })).toBeVisible();
}

export async function expectCards(page: Page, totals: UtilityCardTotals): Promise<void> {
  await expect(cardAmount(page, "Total Utilities")).toHaveText(totals.total);
  for (const [label, key] of TYPE_CARDS) {
    await expect(cardAmount(page, label)).toHaveText(totals[key]);
  }
  await expect(cardAmount(page, "Other")).toHaveText(totals.other);
}

export async function expectChart(page: Page, periods: number, types: number): Promise<void> {
  await expect(trendsChart(page)).toHaveAttribute(
    "aria-label",
    `Utility spend trends over ${periods} periods across ${types} utility types`,
  );
}
