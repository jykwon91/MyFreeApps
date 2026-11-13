/** Fills the /order builder the way a customer does. */
import type { Page } from "@playwright/test";

export function pizzaLine(page: Page, index: number) {
  return page.getByRole("main").getByRole("listitem").filter({ hasText: `Pizza ${index + 1}` });
}

export async function fillDetails(page: Page, name: string, phone: string): Promise<void> {
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Phone (for pickup ready text)").fill(phone);
}
