/**
 * No-backend E2E for what a workspace viewer can do on /inquiries and an inquiry's page.
 *
 * Fully mocks the API via page.route(), so it runs under playwright.layout.config.ts
 * in the `frontend-layout-e2e` CI job.
 *
 * Verifies:
 *   - A viewer opens an inquiry from the list, is told it's view only, and gets none
 *     of the controls the server would refuse (New inquiry, stage, reply, promote,
 *     decline, archive, spam marks, notes editing). Notes read as text, and no
 *     write request leaves the page.
 *   - An owner still gets those controls, so the viewer check can't pass by accident.
 *   - The viewer's page has no horizontal overflow on a phone.
 */
import { test, expect, type Page, type Request } from "@playwright/test";
import { ORG_ID, plantAuth } from "./fixtures/mockSession";

const INQUIRY_ID = "00000000-0000-0000-0000-0000000000a1";
const NOTES = "Prefers a ground-floor room.\nAsked about parking.";

const SUMMARY = {
  id: INQUIRY_ID,
  source: "FF",
  listing_id: null,
  stage: "new",
  inquirer_name: "Alice Nguyen",
  inquirer_employer: "Texas Children's Hospital",
  desired_start_date: "2026-06-01",
  desired_end_date: "2026-08-31",
  gut_rating: null,
  received_at: "2026-04-25T10:00:00Z",
  spam_status: "flagged",
  spam_score: 62,
  submitted_via: "manual_entry",
  last_message_preview: "Hello, I'd love to rent for 3 months.",
  last_message_at: "2026-04-25T10:00:00Z",
};

const DETAIL = {
  ...SUMMARY,
  organization_id: ORG_ID,
  user_id: "00000000-0000-0000-0000-000000000001",
  external_inquiry_id: "I-12345",
  inquirer_email: "alice@example.com",
  inquirer_phone: "+15551234567",
  notes: NOTES,
  email_message_id: null,
  linked_applicant_id: null,
  move_in_date: null,
  move_out_date: null,
  occupant_count: null,
  has_pets: null,
  pets_description: null,
  vehicle_count: null,
  current_city: null,
  employment_status: null,
  why_this_room: null,
  additional_notes: null,
  messages: [
    {
      id: "00000000-0000-0000-0000-0000000000b1",
      inquiry_id: INQUIRY_ID,
      direction: "inbound",
      channel: "email",
      from_address: "alice@example.com",
      to_address: "host@example.com",
      subject: "Inquiry about your listing",
      raw_email_body: "Hello, I'd love to rent for 3 months.",
      parsed_body: "Hello, I'd love to rent for 3 months.",
      email_message_id: "<msg-1@gmail>",
      sent_at: "2026-04-25T10:00:00Z",
      created_at: "2026-04-25T10:00:00Z",
    },
  ],
  events: [],
  created_at: "2026-04-25T10:00:00Z",
  updated_at: "2026-04-25T10:00:00Z",
};

const json = (body: unknown) => ({ status: 200, contentType: "application/json", body: JSON.stringify(body) });

/** Answers the pages' reads and records every write, which a viewer must never send. */
async function stubApi(page: Page, orgRole: "owner" | "viewer"): Promise<string[]> {
  const writes: string[] = [];
  // Registered first so the specific routes below win; the page's other reads get an empty answer.
  await page.route("**/api/**", (route, request: Request) => {
    if (request.method() !== "GET") writes.push(`${request.method()} ${new URL(request.url()).pathname}`);
    return route.fulfill(json(request.method() === "GET" ? [] : {}));
  });
  await page.route("**/api/users/me", (route) =>
    route.fulfill(
      json({
        id: "00000000-0000-0000-0000-000000000001",
        email: "test@example.com",
        name: "Test User",
        is_active: true,
        is_superuser: false,
        is_verified: true,
        role: "owner",
      }),
    ),
  );
  await page.route("**/api/organizations", (route) =>
    route.fulfill(json([{ id: ORG_ID, name: "Test Workspace", role: orgRole, org_role: orgRole }])),
  );
  await page.route("**/api/version", (route) => route.fulfill(json({ version: "test" })));
  await page.route("**/api/tax-profile", (route) =>
    route.fulfill(json({ onboarding_completed: true, tax_situations: [], filing_status: null, dependents_count: 0 })),
  );
  await page.route(/\/api\/listings(\?.*)?$/, (route) => route.fulfill(json({ items: [], total: 0, has_more: false })));
  await page.route(/\/api\/inquiries(\?.*)?$/, (route, request: Request) =>
    request.method() === "GET"
      ? route.fulfill(json({ items: [SUMMARY], total: 1, has_more: false }))
      : route.fallback(),
  );
  await page.route(`**/api/inquiries/${INQUIRY_ID}`, (route, request: Request) =>
    request.method() === "GET" ? route.fulfill(json(DETAIL)) : route.fallback(),
  );
  return writes;
}

async function openInquiryFromList(page: Page): Promise<void> {
  await page.goto("/inquiries");
  await page.getByText("Alice Nguyen").locator("visible=true").first().click();
  await expect(page.getByRole("heading", { name: "Alice Nguyen" })).toBeVisible();
}

test.describe("Inquiries for a viewer", () => {
  test("says it's view only and offers nothing the server would refuse", async ({ page }) => {
    await plantAuth(page);
    const writes = await stubApi(page, "viewer");

    await page.goto("/inquiries");
    await expect(page.getByText("Alice Nguyen").locator("visible=true").first()).toBeVisible();
    await expect(page.getByTestId("new-inquiry-button")).toHaveCount(0);
    await expect(page.getByTestId("manage-reply-templates-link")).toBeVisible();

    await openInquiryFromList(page);
    await expect(
      page.getByText("View only. Ask a workspace admin to reply to, promote, or change inquiries.", { exact: true }),
    ).toBeVisible();
    for (const name of ["Reply with template", "Promote to applicant", "Decline", "Archive", "Mark as spam", "Mark as not spam"]) {
      await expect(page.getByRole("button", { name, exact: true })).toHaveCount(0);
    }
    await expect(page.getByTestId("inquiry-stage-dropdown")).toHaveCount(0);
    await expect(page.getByTestId("inquiry-action-row")).toHaveCount(0);
    await expect(page.getByRole("textbox")).toHaveCount(0);

    const notes = page.getByTestId("inquiry-notes-text");
    await expect(notes).toHaveText(NOTES, { useInnerText: true });
    await expect(page.getByTestId("spam-triage-toggle")).toBeVisible();

    expect(writes).toEqual([]);
  });

  test("fits a phone screen without sideways scrolling", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await plantAuth(page);
    await stubApi(page, "viewer");
    await openInquiryFromList(page);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test.describe("Inquiries for an owner", () => {
  test("still offers the controls a viewer doesn't get", async ({ page }) => {
    await plantAuth(page);
    await stubApi(page, "owner");

    await page.goto("/inquiries");
    await expect(page.getByTestId("new-inquiry-button")).toBeVisible();

    await openInquiryFromList(page);
    await expect(page.getByTestId("inquiry-view-only")).toHaveCount(0);
    for (const name of ["Reply with template", "Promote to applicant", "Decline", "Archive", "Mark as spam", "Mark as not spam"]) {
      await expect(page.getByRole("button", { name, exact: true })).toBeVisible();
    }
    await expect(page.getByTestId("inquiry-stage-dropdown")).toBeVisible();
    await expect(page.getByTestId("inquiry-notes-editor")).toHaveValue(NOTES);
  });
});
