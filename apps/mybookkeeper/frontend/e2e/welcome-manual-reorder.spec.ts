import type { Locator, Page } from "@playwright/test";
import { test, expect, type APIRequestContext } from "./fixtures/auth";
import { createWelcomeManual, deleteWelcomeManual } from "./fixtures/welcome-manual";

/**
 * Welcome Manual reordering — behavioural E2E.
 *
 * Seeds a manual (3 sections, the first with 3 fields) through the public API,
 * reorders sections and fields through the web UI with the dnd-kit keyboard
 * sensor (focus handle → Space to lift → Arrow to move → Space to drop), then
 * asserts the new order in the UI, after a reload, and in the API response.
 * Everything created is deleted in `finally`, even when an assertion fails.
 */

interface ManualDetail {
  sections: Array<{
    id: string;
    title: string;
    display_order: number;
    fields: Array<{ id: string; label: string; display_order: number }>;
  }>;
}

async function fetchManual(api: APIRequestContext, id: string): Promise<ManualDetail> {
  const res = await api.get(`/welcome-manuals/${id}`);
  if (!res.ok()) throw new Error(`fetchManual failed: ${res.status()} ${await res.text()}`);
  return res.json();
}

async function postJson(api: APIRequestContext, url: string, data: object): Promise<{ id: string }> {
  const res = await api.post(url, { data });
  if (!res.ok()) throw new Error(`POST ${url} failed: ${res.status()} ${await res.text()}`);
  return res.json();
}

/**
 * Move a sortable item one slot down with the dnd-kit keyboard sensor, waiting for each
 * step to register (pick-up, move, drop) and for the order PUT to answer.
 */
async function moveDownOneSlot(page: Page, handle: Locator, orderPath: string): Promise<void> {
  await handle.focus();
  await handle.press("Space");
  await expect(handle).toHaveAttribute("aria-pressed", "true");
  await handle.press("ArrowDown");
  // The first announcement can name the dragged item itself, until the keyboard move has
  // scrolled and measured; wait for it to name a different item.
  await expect
    .poll(async () => {
      // Each sortable list has its own live region; a finished drag leaves its "dropped" text behind.
      const regions = await page.locator("[role=status]").allTextContents();
      return regions.some((text) => {
        const match = /Draggable item (\S+) was moved over droppable area (\S+?)\.?$/.exec(text.trim());
        return match !== null && match[1] !== match[2];
      });
    })
    .toBe(true);
  const saved = page.waitForResponse((res) => res.request().method() === "PUT" && res.url().endsWith(orderPath));
  await handle.press("Space");
  expect((await saved).ok()).toBe(true);
}

function apiOrder<T extends { display_order: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.display_order - b.display_order);
}

test.describe("Welcome Manual reordering", () => {
  test("reorders sections and fields via the UI and persists the order", async ({
    authedPage: page,
    api,
  }) => {
    const runId = Date.now();
    const titles = [`Alpha ${runId}`, `Bravo ${runId}`, `Charlie ${runId}`];
    const labels = [`One ${runId}`, `Two ${runId}`, `Three ${runId}`];
    let manualId: string | null = null;

    try {
      const manual = await createWelcomeManual(api, {
        title: `E2E Reorder ${runId}`,
        seed_default_sections: false,
      });
      manualId = manual.id;

      const sectionIds: string[] = [];
      for (const title of titles) {
        sectionIds.push((await postJson(api, `/welcome-manuals/${manualId}/sections`, { title })).id);
      }
      for (const label of labels) {
        await postJson(api, `/welcome-manuals/${manualId}/sections/${sectionIds[0]}/fields`, {
          label,
          value: "x",
        });
      }

      await page.goto(`/welcome-manuals/${manualId}`);
      await page.waitForLoadState("networkidle");

      const sectionTitles = page.getByTestId("welcome-manual-section-title");
      await expect(sectionTitles).toHaveCount(3);
      await expect(sectionTitles.nth(0)).toHaveValue(titles[0]);

      // Sections: drag the first card one slot down → Bravo, Alpha, Charlie.
      await moveDownOneSlot(page, page.getByTestId("welcome-manual-section-drag-handle").first(), "/sections/order");
      const expectedSections = [titles[1], titles[0], titles[2]];
      await expect(sectionTitles.nth(0)).toHaveValue(expectedSections[0]);
      await expect(sectionTitles.nth(1)).toHaveValue(expectedSections[1]);
      await expect(sectionTitles.nth(2)).toHaveValue(expectedSections[2]);

      await expect(async () => {
        const persisted = await fetchManual(api, manualId!);
        expect(apiOrder(persisted.sections).map((s) => s.title)).toEqual(expectedSections);
      }).toPass({ timeout: 10000 });

      // Fields: the section holding the three fields is now second.
      const fieldSection = page.getByTestId("welcome-manual-section-card").nth(1);
      const fieldLabels = fieldSection.getByTestId("welcome-manual-field-label");
      await expect(fieldLabels).toHaveCount(3);
      await moveDownOneSlot(page, fieldSection.getByTestId("welcome-manual-field-drag-handle").first(), "/fields/order");
      const expectedFields = [labels[1], labels[0], labels[2]];
      await expect(fieldLabels.nth(0)).toHaveValue(expectedFields[0]);
      await expect(fieldLabels.nth(1)).toHaveValue(expectedFields[1]);
      await expect(fieldLabels.nth(2)).toHaveValue(expectedFields[2]);

      await expect(async () => {
        const persisted = await fetchManual(api, manualId!);
        const section = persisted.sections.find((s) => s.id === sectionIds[0]);
        expect(apiOrder(section!.fields).map((f) => f.label)).toEqual(expectedFields);
      }).toPass({ timeout: 10000 });

      // Both orders survive a reload.
      await page.reload();
      await page.waitForLoadState("networkidle");
      await expect(sectionTitles.nth(0)).toHaveValue(expectedSections[0]);
      await expect(sectionTitles.nth(1)).toHaveValue(expectedSections[1]);
      await expect(sectionTitles.nth(2)).toHaveValue(expectedSections[2]);
      const reloadedLabels = page
        .getByTestId("welcome-manual-section-card")
        .nth(1)
        .getByTestId("welcome-manual-field-label");
      await expect(reloadedLabels.nth(0)).toHaveValue(expectedFields[0]);
      await expect(reloadedLabels.nth(1)).toHaveValue(expectedFields[1]);
      await expect(reloadedLabels.nth(2)).toHaveValue(expectedFields[2]);
    } finally {
      if (manualId) await deleteWelcomeManual(api, manualId);
    }
  });
});
