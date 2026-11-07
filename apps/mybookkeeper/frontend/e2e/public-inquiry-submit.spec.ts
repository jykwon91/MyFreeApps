import { test, expect } from "./fixtures/auth";
import type { CreatedListing } from "./fixtures/created-listing";
import { deleteInquiry } from "./fixtures/inquiries";
import { createListing } from "./fixtures/listing-seed";
import { localDateOffset, localToday } from "./fixtures/local-today";
import { createProperty, deleteListing, deleteProperty } from "./fixtures/seed-data";

/**
 * An applicant sends the public inquiry form for a move-in of today, their
 * own today, and the host's inbox gets it with that date.
 */
test.describe("Public inquiry form", () => {
  test("an applicant can ask to move in today", async ({ page, api }) => {
    const runId = Date.now();
    const applicant = `E2E Applicant ${runId}`;
    const property = await createProperty(api, { name: `E2E Inquiry Property ${runId}` });
    let listing: CreatedListing | null = null;
    let inquiryId: string | null = null;

    try {
      listing = await createListing(api, {
        property_id: property.id as string,
        title: `E2E Inquiry Listing ${runId}`,
        monthly_rate: "1500.00",
      });

      await page.goto(`/apply/${listing.slug}`);
      await expect(page.getByTestId("public-inquiry-form")).toBeVisible();

      const moveIn = page.getByTestId("public-inquiry-move-in");
      await expect(moveIn).toHaveAttribute("min", localToday());
      await expect(moveIn).toHaveAttribute("max", localDateOffset(365));

      await page.getByTestId("public-inquiry-name").fill(applicant);
      await page.getByTestId("public-inquiry-email").fill(`e2e-${runId}@example.com`);
      await page.getByTestId("public-inquiry-phone").fill("555-123-4567");
      await moveIn.fill(localToday());
      await page.getByTestId("public-inquiry-move-out-date").fill(localDateOffset(90));
      await page.getByTestId("public-inquiry-occupants").fill("1");
      await page.getByTestId("public-inquiry-pets-no").click();
      await page.getByTestId("public-inquiry-city").fill("Austin");
      await page.getByTestId("public-inquiry-region").selectOption("TX");
      await page.getByTestId("public-inquiry-employment").selectOption("employed");
      await page
        .getByTestId("public-inquiry-why")
        .fill("I'm a travel nurse on assignment at the medical center nearby.");

      const submitted = page.waitForResponse(
        (r) => r.url().endsWith("/api/inquiries/public") && r.request().method() === "POST",
      );
      await page.getByTestId("public-inquiry-submit").click();
      expect((await submitted).status()).toBe(200);
      await expect(page.getByText(/Thanks!/)).toBeVisible();

      const inbox = await api.get("/inquiries", { params: { limit: 100 } });
      expect(inbox.ok()).toBe(true);
      const { items } = (await inbox.json()) as {
        items: { id: string; inquirer_name: string | null }[];
      };
      const received = items.find((i) => i.inquirer_name === applicant);
      expect(received, "the inquiry reached the host's inbox").toBeDefined();
      inquiryId = received!.id;

      const detail = await api.get(`/inquiries/${inquiryId}`);
      expect(detail.ok()).toBe(true);
      expect(((await detail.json()) as { move_in_date: string }).move_in_date).toBe(localToday());
    } finally {
      if (inquiryId) await deleteInquiry(api, inquiryId);
      if (listing) await deleteListing(api, listing.id);
      await deleteProperty(api, property.id as string);
    }
  });
});
