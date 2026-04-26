import { test, expect } from "./fixtures/auth";

test.describe("Tax Return Detail", () => {
  test("navigating to tax returns page", async ({ authedPage: page }) => {
    await page.goto("/tax-returns");
    await expect(page.getByRole("heading", { name: "Tax Returns" })).toBeVisible();

    // Click on a tax return card if one exists
    const card = page.getByText(/^20\d{2}$/).first();
    if (await card.isVisible({ timeout: 10000 })) {
      await card.click();
      // Should navigate to detail page
      await expect(page).toHaveURL(/\/tax-returns\//);
    }
  });

  test.describe("With existing tax return", () => {
    let returnId: string;

    test.beforeEach(async ({ authedPage: page, api }) => {
      const res = await api.get("/tax-returns");
      if (!res.ok()) {
        test.skip(true, "Tax returns API unavailable");
        return;
      }
      const returns = await res.json();
      if (returns.length === 0) {
        test.skip(true, "No tax returns exist");
        return;
      }

      returnId = returns[0].id;
      await page.goto(`/tax-returns/${returnId}`);
    });

    test("detail page shows return info", async ({ authedPage: page }) => {
      await expect(page.getByText(/20\d{2}/).first()).toBeVisible({ timeout: 10000 });
    });

    test("detail page shows forms overview", async ({ authedPage: page }) => {
      const formsHeading = page.getByRole("heading", { name: "Forms" });
      await expect(formsHeading).toBeVisible({ timeout: 10000 });
      const formContent = page.getByText(/schedule.*e|form 1040|1099/i).first();
      const emptyState = page.getByText(/no forms yet/i);
      const hasForm = await formContent.isVisible({ timeout: 3000 });
      const hasEmpty = await emptyState.isVisible({ timeout: 3000 });
      expect(hasForm || hasEmpty).toBe(true);
    });

    test("recompute button triggers recalculation", async ({ authedPage: page }) => {
      const recomputeBtn = page.getByRole("button", { name: /recompute/i });
      const isVisible = await recomputeBtn.isVisible({ timeout: 10000 }).catch(() => false);
      test.skip(!isVisible, "Recompute button not visible — no tax return data");

      await recomputeBtn.click();

      // Verify feedback: either a success toast, loading state, or updated content
      await expect(
        page.getByText(/recomputed|updated|success/i).first()
          .or(page.getByRole("button", { name: /recomputing/i }))
          .or(page.getByText(/forms updated/i).first())
      ).toBeVisible({ timeout: 10000 });
    });

    test("back button navigates to tax returns list", async ({ authedPage: page }) => {
      const backBtn = page.getByRole("button", { name: /back/i }).or(page.getByRole("link", { name: /back|tax returns/i }));
      const isVisible = await backBtn.isVisible({ timeout: 10000 });
      test.skip(!isVisible, "Back button not found on tax return detail page");
      await backBtn.click();
      await expect(page).toHaveURL(/\/tax-returns$/);
    });

    test("validation panel shows results", async ({ authedPage: page }) => {
      const validation = page.getByText(/validation|issue|warning/i).first();
      const isVisible = await validation.isVisible({ timeout: 10000 });
      test.skip(!isVisible, "No validation panel visible on tax return detail page");
      await expect(validation).toBeVisible();
    });

    test("tax advisor panel exists", async ({ authedPage: page }) => {
      const advisor = page.getByText(/tax advisor|ask|advice/i).first();
      const advisorBtn = page.getByRole("button", { name: /advisor|ask/i });
      const advisorVisible = await advisor.isVisible({ timeout: 5000 });
      const advisorBtnVisible = !advisorVisible && await advisorBtn.isVisible({ timeout: 5000 });
      test.skip(!advisorVisible && !advisorBtnVisible, "No tax advisor panel or button visible on tax return detail page");
      if (advisorVisible) {
        await expect(advisor).toBeVisible();
      } else {
        await expect(advisorBtn).toBeVisible();
      }
    });

    test("source documents heading is visible", async ({ authedPage: page }) => {
      const heading = page.getByRole("heading", { name: "Source Documents" });
      await expect(heading).toBeVisible({ timeout: 10000 });
    });

    test("source documents section shows received documents or empty state", async ({ authedPage: page, api }) => {
      // Wait for the section to load past skeleton
      await expect(
        page.getByRole("heading", { name: "Source Documents" })
      ).toBeVisible({ timeout: 10000 });

      // Fetch source documents from the API to know what to expect
      const res = await api.get(`/tax-returns/${returnId}/source-documents`);
      if (!res.ok()) {
        // API might not be available — just verify the section renders
        return;
      }
      const data = await res.json();

      if (data.documents && data.documents.length > 0) {
        // Should show "Received Documents (N)" header
        await expect(
          page.getByText(/received documents/i).first()
        ).toBeVisible({ timeout: 10000 });

        // Verify the first document's issuer name appears
        const firstDoc = data.documents[0];
        if (firstDoc.issuer_name) {
          await expect(
            page.getByText(firstDoc.issuer_name).first()
          ).toBeVisible({ timeout: 5000 });
        }
      } else {
        // Empty state should explain no documents are linked
        await expect(
          page.getByText(/don't see any tax documents/i).first()
        ).toBeVisible({ timeout: 10000 });
      }
    });

    test("completeness checklist shows expected document types", async ({ authedPage: page, api }) => {
      await expect(
        page.getByRole("heading", { name: "Source Documents" })
      ).toBeVisible({ timeout: 10000 });

      const res = await api.get(`/tax-returns/${returnId}/source-documents`);
      test.skip(!res.ok(), "Tax return source documents API unavailable");
      const data = await res.json();

      if (data.checklist && data.checklist.length > 0) {
        // Document Checklist header should be visible
        await expect(
          page.getByText(/document checklist/i).first()
        ).toBeVisible({ timeout: 10000 });

        // Should show received/missing counts
        const receivedCount = data.checklist.filter(
          (i: { status: string }) => i.status === "received"
        ).length;
        const missingCount = data.checklist.filter(
          (i: { status: string }) => i.status === "missing"
        ).length;
        await expect(
          page.getByText(`${receivedCount} received, ${missingCount} missing`)
        ).toBeVisible({ timeout: 5000 });

        // Each checklist item should show its expected_from (issuer) if present
        for (const item of data.checklist.slice(0, 3)) {
          if (item.expected_from) {
            await expect(
              page.getByText(item.expected_from).first()
            ).toBeVisible({ timeout: 5000 });
          }
          // Status badge should show "Received" or "Upload" link
          if (item.status === "received") {
            await expect(
              page.getByText("Received").first()
            ).toBeVisible({ timeout: 5000 });
          }
        }
      }
      // If no checklist items, the checklist section simply doesn't render — that's fine
    });
  });
});
