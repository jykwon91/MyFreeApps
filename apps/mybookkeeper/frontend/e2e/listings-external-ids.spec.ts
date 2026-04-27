import { test, expect, type APIRequestContext, type Page } from "./fixtures/auth";
import { createProperty, deleteProperty } from "./fixtures/seed-data";

/**
 * PR 1.3 — External-ID linkage UI behavioural E2E.
 *
 * Each test creates its own seed listings via the test API and tears them
 * down in `finally` so we never leave test data in dev/prod databases (per
 * `feedback_clean_test_data.md`). Cascade delete on `listing_external_ids`
 * handles the child rows.
 */

async function deleteListingViaTestApi(api: APIRequestContext, listingId: string): Promise<void> {
  await api.delete(`/test/listings/${listingId}`).catch(() => {});
}

async function seedListing(
  api: APIRequestContext,
  propertyId: string,
  title: string,
): Promise<string> {
  const res = await api.post("/test/seed-listing", {
    data: {
      property_id: propertyId,
      title,
      monthly_rate: "1500.00",
      room_type: "private_room",
      status: "active",
    },
  });
  if (!res.ok()) {
    throw new Error(`seedListing failed: ${res.status()} ${await res.text()}`);
  }
  const body = (await res.json()) as { id: string };
  return body.id;
}

async function gotoListingDetail(page: Page, listingId: string): Promise<void> {
  await page.goto(`/listings/${listingId}`);
  await page.waitForLoadState("networkidle");
  await expect(page.getByTestId("external-id-section")).toBeVisible({
    timeout: 10000,
  });
}

test.describe("Listings external-ID linkage (PR 1.3)", () => {
  test("user can add, edit, and remove an FF external link end-to-end", async ({
    authedPage: page,
    api,
  }) => {
    const runId = Date.now();
    const property = await createProperty(api, {
      name: `E2E ExtId Property ${runId}`,
    });
    const listingIds: string[] = [];

    try {
      const listingId = await seedListing(api, property.id, `E2E ExtId Listing ${runId}`);
      listingIds.push(listingId);

      await gotoListingDetail(page, listingId);

      // 1) Empty state visible.
      await expect(page.getByTestId("external-id-empty-state")).toBeVisible();
      await expect(page.getByTestId("external-id-add-cta")).toBeVisible();

      // 2) ADD — open the form and submit a valid FF link.
      await page.getByTestId("external-id-add-cta").click();
      await expect(page.getByTestId("external-id-form")).toBeVisible();
      await page
        .getByTestId("external-id-form-source")
        .selectOption("FF");
      const externalIdValue = `TEST-FF-${runId}`;
      const externalUrlValue = `https://furnishedfinder.com/property/${externalIdValue}`;
      await page
        .getByTestId("external-id-form-external-id")
        .fill(externalIdValue);
      await page
        .getByTestId("external-id-form-external-url")
        .fill(externalUrlValue);
      await page.getByTestId("external-id-form-submit").click();

      // The form closes and the row appears.
      await expect(page.getByTestId("external-id-list")).toBeVisible({
        timeout: 10000,
      });
      await expect(page.getByText(externalIdValue)).toBeVisible();
      await expect(
        page.getByTestId("source-badge-FF").first(),
      ).toBeVisible();

      // Verify via API (DB-side proof — not just DOM).
      const detailRes = await api.get(`/listings/${listingId}`);
      const detail = (await detailRes.json()) as {
        external_ids: Array<{ source: string; external_id: string }>;
      };
      expect(detail.external_ids).toHaveLength(1);
      expect(detail.external_ids[0].source).toBe("FF");
      expect(detail.external_ids[0].external_id).toBe(externalIdValue);

      // 3) EDIT — change the URL, save, verify update.
      const rows = await page.getByTestId(/^external-id-row-/).all();
      expect(rows.length).toBe(1);
      await page
        .getByTestId(/^external-id-edit-/)
        .first()
        .click();
      await expect(page.getByTestId("external-id-form")).toBeVisible();
      const newUrl = `https://furnishedfinder.com/property/${externalIdValue}/edited`;
      const urlInput = page.getByTestId("external-id-form-external-url");
      await urlInput.clear();
      await urlInput.fill(newUrl);
      await page.getByTestId("external-id-form-submit").click();

      await expect(page.getByTestId("external-id-form")).not.toBeVisible({
        timeout: 10000,
      });

      const afterEditRes = await api.get(`/listings/${listingId}`);
      const afterEdit = (await afterEditRes.json()) as {
        external_ids: Array<{ external_url: string }>;
      };
      expect(afterEdit.external_ids[0].external_url).toBe(newUrl);

      // 4) REMOVE — verify row disappears AND can re-add the same source.
      await page
        .getByTestId(/^external-id-remove-/)
        .first()
        .click();

      await expect(page.getByTestId("external-id-empty-state")).toBeVisible({
        timeout: 10000,
      });
      const afterDeleteRes = await api.get(`/listings/${listingId}`);
      const afterDelete = (await afterDeleteRes.json()) as {
        external_ids: unknown[];
      };
      expect(afterDelete.external_ids).toHaveLength(0);

      // Re-add same FF source — must be allowed now that the row is gone.
      await page.getByTestId("external-id-add-cta").click();
      await expect(page.getByTestId("external-id-form-source")).toBeVisible();
      // FF should be available again.
      const optionValues = await page
        .getByTestId("external-id-form-source")
        .locator("option")
        .allTextContents();
      expect(optionValues.some((t) => t.includes("Furnished Finder"))).toBe(
        true,
      );
    } finally {
      for (const id of listingIds) {
        await deleteListingViaTestApi(api, id);
      }
      await deleteProperty(api, property.id);
    }
  });

  test("source dropdown excludes already-linked sources when adding a second link", async ({
    authedPage: page,
    api,
  }) => {
    const runId = Date.now();
    const property = await createProperty(api, {
      name: `E2E ExtId DropdownExclude Property ${runId}`,
    });
    const listingIds: string[] = [];

    try {
      const listingId = await seedListing(
        api,
        property.id,
        `E2E ExtId DropdownExclude Listing ${runId}`,
      );
      listingIds.push(listingId);

      // Seed an FF link via the public API so the UI shows it as already-linked.
      const seedExtRes = await api.post(`/listings/${listingId}/external-ids`, {
        data: {
          source: "FF",
          external_id: `EXISTING-FF-${runId}`,
        },
      });
      expect(seedExtRes.ok()).toBeTruthy();

      await gotoListingDetail(page, listingId);

      // Open the add form via "Add link" header button.
      await page.getByTestId("external-id-add-button").click();
      await expect(page.getByTestId("external-id-form")).toBeVisible();

      // Source dropdown options must not include FF (already linked).
      const select = page.getByTestId("external-id-form-source");
      const optionTexts = await select.locator("option").allTextContents();
      expect(
        optionTexts.find((t) => t === "Furnished Finder"),
      ).toBeUndefined();
      // TNH/Airbnb/Direct still available.
      expect(optionTexts.length).toBeGreaterThan(0);
    } finally {
      for (const id of listingIds) {
        await deleteListingViaTestApi(api, id);
      }
      await deleteProperty(api, property.id);
    }
  });

  test("409 conflict toast shows when same FF external_id is reused on another listing", async ({
    authedPage: page,
    api,
  }) => {
    const runId = Date.now();
    const property = await createProperty(api, {
      name: `E2E ExtId Conflict Property ${runId}`,
    });
    const listingIds: string[] = [];
    const sharedExternalId = `SHARED-FF-${runId}`;

    try {
      // Seed listing A and link FF→sharedExternalId.
      const listingAId = await seedListing(
        api,
        property.id,
        `E2E ExtId Conflict A ${runId}`,
      );
      listingIds.push(listingAId);
      const seedRes = await api.post(`/listings/${listingAId}/external-ids`, {
        data: { source: "FF", external_id: sharedExternalId },
      });
      expect(seedRes.ok()).toBeTruthy();

      // Seed listing B, navigate, attempt to claim the same FF id.
      const listingBId = await seedListing(
        api,
        property.id,
        `E2E ExtId Conflict B ${runId}`,
      );
      listingIds.push(listingBId);

      await gotoListingDetail(page, listingBId);
      await page.getByTestId("external-id-add-cta").click();
      await page
        .getByTestId("external-id-form-source")
        .selectOption("FF");
      await page
        .getByTestId("external-id-form-external-id")
        .fill(sharedExternalId);
      await page.getByTestId("external-id-form-submit").click();

      // Toast surfaces with the conflict message; the form does NOT close.
      // The toast renders in both the visual toast element and the
      // aria-live screen-reader announcer; either is enough to confirm
      // the user got feedback, so we use `.first()`.
      await expect(
        page.getByText(/already linked to another listing/i).first(),
      ).toBeVisible({ timeout: 10000 });
      await expect(page.getByTestId("external-id-form")).toBeVisible();

      // Listing B still has zero external IDs.
      const detailRes = await api.get(`/listings/${listingBId}`);
      const detail = (await detailRes.json()) as { external_ids: unknown[] };
      expect(detail.external_ids).toHaveLength(0);
    } finally {
      for (const id of listingIds) {
        await deleteListingViaTestApi(api, id);
      }
      await deleteProperty(api, property.id);
    }
  });
});
