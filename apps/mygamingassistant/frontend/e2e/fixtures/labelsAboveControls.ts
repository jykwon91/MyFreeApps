import type { Page } from "@playwright/test";
import { expect } from "@platform/ui/test-support/crashGuard";

/**
 * Every visible field label in a `space-y-*` stack sits above its control (wrapped or not), not
 * beside it. An inline <label> next to a width-capped input looks glued to it.
 */
export async function expectLabelsAboveControls(page: Page): Promise<void> {
  const beside = await page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLLabelElement>("label[for]")).flatMap((label) => {
      const control = label.htmlFor ? document.getElementById(label.htmlFor) : null;
      const parent = label.parentElement;
      if (!control || !parent || label.classList.contains("sr-only")) return [];
      if (!parent.contains(control) || !/\bspace-y-\d/.test(parent.className)) return [];
      const l = label.getBoundingClientRect();
      const c = control.getBoundingClientRect();
      if (l.width === 0 || c.width === 0) return [];
      return l.bottom <= c.top + 1 ? [] : [label.textContent?.trim() ?? label.htmlFor];
    }),
  );
  expect(beside, "labels sitting beside their control instead of above it").toEqual([]);
}
