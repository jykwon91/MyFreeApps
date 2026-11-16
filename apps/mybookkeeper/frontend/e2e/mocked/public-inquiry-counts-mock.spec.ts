/**
 * No-backend E2E for the public inquiry form's occupant and vehicle counts.
 *
 * Fully mocks the API via page.route(), so it runs under playwright.layout.config.ts.
 *
 * Verifies that a decimal, negative or too-large count is flagged on its field
 * before anything is sent, and that fixing it lets the inquiry go through.
 */
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { json } from "@platform/ui/test-support/mockResponse";
import { stubUnmatchedApi } from "@platform/ui/test-support/mockSession";

const SLUG = "garage-suite-a-abc123";

const PUBLIC_LISTING = {
  slug: SLUG,
  title: "Garage Suite A",
  description: null,
  monthly_rate: "1500.00",
  room_type: "private_room",
  private_bath: true,
  parking_assigned: true,
  furnished: true,
  pets_on_premises: false,
};

function isoDateOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

test("invalid occupant and vehicle counts are flagged and never sent", async ({ page }) => {
  await stubUnmatchedApi(page, { answer: "empty" });
  await page.route(`**/api/listings/public/${SLUG}`, (route) => route.fulfill(json(PUBLIC_LISTING)));
  const posted: Record<string, unknown>[] = [];
  await page.route("**/api/inquiries/public", (route) => {
    posted.push(route.request().postDataJSON() as Record<string, unknown>);
    return route.fulfill(json({ status: "received" }));
  });

  await page.goto(`/apply/${SLUG}`);
  await expect(page.getByTestId("public-inquiry-form")).toBeVisible();

  await page.getByTestId("public-inquiry-name").fill("Alice Smith");
  await page.getByTestId("public-inquiry-email").fill("alice@example.com");
  await page.getByTestId("public-inquiry-phone").fill("555-123-4567");
  await page.getByTestId("public-inquiry-move-in").fill(isoDateOffset(30));
  await page.getByTestId("public-inquiry-move-out-date").fill(isoDateOffset(210));
  await page.getByTestId("public-inquiry-pets-no").click();
  await page.getByTestId("public-inquiry-city").fill("Austin");
  await page.getByTestId("public-inquiry-region").selectOption("TX");
  await page.getByTestId("public-inquiry-employment").selectOption("employed");
  await page
    .getByTestId("public-inquiry-why")
    .fill("I'm a travel nurse on assignment at the medical center.");

  await page.getByTestId("public-inquiry-occupants").fill("2.5");
  await page.getByTestId("public-inquiry-vehicles").fill("-1");
  await page.getByTestId("public-inquiry-submit").click();

  await expect(page.getByTestId("public-inquiry-occupants-error")).toHaveText(/whole number/);
  await expect(page.getByTestId("public-inquiry-vehicles-error")).toHaveText(/negative/);
  expect(posted).toHaveLength(0);

  await page.getByTestId("public-inquiry-vehicles").fill("11");
  await expect(page.getByTestId("public-inquiry-vehicles-error")).toHaveText(/Maximum is 10/);

  await page.getByTestId("public-inquiry-occupants").fill("2");
  await page.getByTestId("public-inquiry-vehicles").fill("1");
  await page.getByTestId("public-inquiry-submit").click();

  await expect(page.getByText(/Thanks!/)).toBeVisible();
  expect(posted).toHaveLength(1);
  expect(posted[0]).toMatchObject({ occupant_count: 2, vehicle_count: 1 });
});
