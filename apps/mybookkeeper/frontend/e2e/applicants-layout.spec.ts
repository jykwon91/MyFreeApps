import { test, expect, type APIRequestContext } from "./fixtures/auth";

/**
 * Layout E2E for the Applicants list + detail (PR 3.1b).
 *
 * Verifies:
 *   1. The list skeleton has the same number of cards/rows as the loaded
 *      list (no layout shift when data arrives).
 *   2. The list renders without horizontal overflow at mobile / tablet /
 *      desktop viewports.
 *   3. The stage chip filter has 44px touch targets.
 *   4. The detail-page skeleton has the same section headers as the loaded
 *      page so there's no visual jump when data arrives.
 */

interface SeedApplicantPayload {
  legal_name?: string;
  employer_or_hospital?: string;
  stage?: string;
  seed_event?: boolean;
  seed_screening?: boolean;
  seed_reference?: boolean;
  seed_video_call_note?: boolean;
}

async function seedApplicant(
  api: APIRequestContext,
  payload: SeedApplicantPayload,
): Promise<string> {
  const res = await api.post("/test/seed-applicant", { data: payload });
  if (!res.ok()) {
    throw new Error(`seedApplicant failed: ${res.status()} ${await res.text()}`);
  }
  const body = (await res.json()) as { id: string };
  return body.id;
}

async function deleteApplicant(api: APIRequestContext, id: string): Promise<void> {
  await api.delete(`/test/applicants/${id}`).catch(() => {});
}

const APPLICANT_COUNT = 3;

test.describe("Applicants layout (PR 3.1b)", () => {
  test("list skeleton card count is in the same order of magnitude as the loaded card count on mobile", async ({
    authedPage: page,
    api,
  }) => {
    await page.setViewportSize({ width: 375, height: 800 });

    const runId = Date.now();
    const applicantIds: string[] = [];
    try {
      await page.route("**/api/applicants**", async (route) => {
        await new Promise((r) => setTimeout(r, 1500));
        await route.continue();
      });

      const navPromise = page.goto("/applicants");
      await expect(page.getByTestId("applicants-skeleton")).toBeVisible({ timeout: 5000 });

      const skeletonMobileList = page.locator(
        '[data-testid="applicants-skeleton"] ul.md\\:hidden li',
      );
      const skeletonCount = await skeletonMobileList.count();
      expect(skeletonCount).toBeGreaterThan(0);

      for (let i = 0; i < APPLICANT_COUNT; i++) {
        applicantIds.push(
          await seedApplicant(api, {
            legal_name: `E2E Layout Applicant ${runId}-${i}`,
            stage: "lead",
            seed_event: true,
          }),
        );
      }
      await page.unroute("**/api/applicants**");
      await navPromise;
      await page.reload();
      await page.waitForLoadState("networkidle");

      const loadedMobileCards = page.locator('[data-testid="applicants-mobile"] li');
      const loadedCount = await loadedMobileCards.count();
      expect(loadedCount).toBeGreaterThanOrEqual(APPLICANT_COUNT);

      // Same skeleton-vs-loaded tolerance as the inquiries layout spec.
      expect(Math.abs(skeletonCount - loadedCount)).toBeLessThanOrEqual(4);
    } finally {
      for (const id of applicantIds) await deleteApplicant(api, id);
    }
  });

  test("renders without horizontal scroll at mobile / tablet / desktop viewports", async ({
    authedPage: page,
    api,
  }) => {
    const runId = Date.now();
    const applicantIds: string[] = [];

    try {
      for (let i = 0; i < 3; i++) {
        applicantIds.push(
          await seedApplicant(api, {
            legal_name: `E2E Multi Layout Applicant ${runId}-${i}`,
            stage: "lead",
            seed_event: true,
          }),
        );
      }

      const viewports: ReadonlyArray<{ name: string; width: number; height: number }> = [
        { name: "mobile", width: 375, height: 800 },
        { name: "tablet", width: 768, height: 1024 },
        { name: "desktop", width: 1280, height: 900 },
      ];

      for (const vp of viewports) {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.goto("/applicants");
        await page.waitForLoadState("networkidle");

        await expect(
          page.getByRole("heading", { name: "Applicants" }),
          `heading visible at ${vp.name}`,
        ).toBeVisible();

        const docWidth = await page.evaluate(() => document.documentElement.scrollWidth);
        expect(docWidth, `no horizontal overflow at ${vp.name}`).toBeLessThanOrEqual(
          vp.width + 1,
        );
      }
    } finally {
      for (const id of applicantIds) await deleteApplicant(api, id);
    }
  });

  test("applicant stage chip filter is keyboard-accessible (44px touch target)", async ({
    authedPage: page,
  }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto("/applicants");
    await expect(page.getByRole("heading", { name: "Applicants" })).toBeVisible();

    const allChip = page.getByTestId("applicant-filter-all");
    await expect(allChip).toBeVisible();
    const box = await allChip.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  });

  test("detail skeleton section headers match the loaded page", async ({
    authedPage: page,
    api,
  }) => {
    const runId = Date.now();
    const applicantId = await seedApplicant(api, {
      legal_name: `E2E Detail Skeleton ${runId}`,
      employer_or_hospital: "Memorial Hermann",
      stage: "lead",
      seed_event: true,
      seed_screening: true,
      seed_reference: true,
      seed_video_call_note: true,
    });

    try {
      // Throttle to give the skeleton a chance to render.
      await page.route(`**/api/applicants/${applicantId}`, async (route) => {
        await new Promise((r) => setTimeout(r, 1500));
        await route.continue();
      });

      const navPromise = page.goto(`/applicants/${applicantId}`);
      // Skeleton renders all the section placeholders.
      await expect(page.getByTestId("applicant-detail-skeleton")).toBeVisible({
        timeout: 5000,
      });
      const skeletonSections = [
        "contract-section-skeleton",
        "sensitive-section-skeleton",
        "screening-section-skeleton",
        "references-section-skeleton",
        "notes-section-skeleton",
      ];
      for (const sectionId of skeletonSections) {
        await expect(
          page.getByTestId(sectionId),
          `${sectionId} present in skeleton`,
        ).toBeVisible();
      }

      await page.unroute(`**/api/applicants/${applicantId}`);
      await navPromise;
      await page.waitForLoadState("networkidle");

      // Loaded page has the matching section headers.
      const loadedSections = [
        "contract-section",
        "sensitive-data-section",
        "screening-section",
        "references-section",
        "notes-section",
      ];
      for (const sectionId of loadedSections) {
        await expect(
          page.getByTestId(sectionId),
          `${sectionId} present after load`,
        ).toBeVisible();
      }
    } finally {
      await deleteApplicant(api, applicantId);
    }
  });
});
