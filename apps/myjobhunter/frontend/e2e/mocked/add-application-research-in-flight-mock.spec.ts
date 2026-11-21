/**
 * No-backend E2E for the research that Add application starts in the
 * background when it adds the posting's company: opening that company while
 * the run is going shows it running (no Run research button to start a
 * second, paid run), then its result, from the one run.
 */
import type { Page } from "@playwright/test";
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { createGate } from "@platform/ui/test-support/gate";
import { json } from "@platform/ui/test-support/mockResponse";
import { stubSignedInShell } from "@platform/ui/test-support/mockSession";
import type { Gate } from "@platform/ui/test-support/types/Gate";
import type { Company } from "@myjobhunter/api-client/types/company";
import type { JdUrlExtractResponse } from "@myjobhunter/api-client/types/application/jd-url-extract-response";
import { mockApplication, mockCompany, mockCompanyResearch } from "./fixtures/mockData";

const LINK = "https://jobs.example.com/linear/staff";
const LINEAR = mockCompany({ id: "00000000-0000-0000-0000-0000000000c3", name: "Linear", primary_domain: "linear.app" });
const RESEARCH = mockCompanyResearch({ company_id: LINEAR.id, green_flags: ["Good pay"] });

const EXTRACTED: JdUrlExtractResponse = {
  title: "Staff Engineer",
  company: "Linear",
  company_website: "https://linear.app/",
  company_logo_url: null,
  location: null,
  description_html: null,
  requirements_text: null,
  summary: null,
  source_url: LINK,
};

interface Stub {
  researchPosts: number;
}

/** The add flow plus the new company's pages; the background research run is held until `gate` opens. */
async function stubFlow(page: Page, gate: Gate): Promise<Stub> {
  const stub: Stub = { researchPosts: 0 };
  let tracked: Company[] = [];
  let researched = false;
  await stubSignedInShell(page);
  await page.route(/\/api\/companies(\?|$)/, (route) => {
    if (route.request().method() === "POST") {
      tracked = [LINEAR];
      return route.fulfill(json(LINEAR, 201));
    }
    return route.fulfill(json({ items: tracked, total: tracked.length }));
  });
  await page.route(new RegExp(`/api/companies/${LINEAR.id}$`), (route) => route.fulfill(json(LINEAR)));
  await page.route(new RegExp(`/api/companies/${LINEAR.id}/research$`), async (route) => {
    if (route.request().method() === "POST") {
      stub.researchPosts += 1;
      await gate.wait;
      researched = true;
      return route.fulfill(json(RESEARCH));
    }
    return researched
      ? route.fulfill(json(RESEARCH))
      : route.fulfill(json({ detail: "No research has been run for this company yet" }, 404));
  });
  await page.route(/\/api\/applications\/extract-from-url$/, (route) => route.fulfill(json(EXTRACTED)));
  await page.route(/\/api\/applications(\?|$)/, (route) =>
    route.request().method() === "POST"
      ? route.fulfill(json(mockApplication({ id: "new-1", company_id: LINEAR.id }), 201))
      : route.fulfill(json({ items: [], total: 0 })),
  );
  return stub;
}

test("opening a company while Add application's background research runs shows it running, then its result", async ({ page }) => {
  const gate = createGate();
  const stub = await stubFlow(page, gate);

  await page.goto("/applications");
  await page.getByRole("button", { name: "Add application" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Add application" });
  await dialog.getByLabel(/job posting url/i).fill(LINK);
  await dialog.getByRole("button", { name: /auto-fill/i }).click();
  await expect(dialog.getByText(/review and adjust before saving/i)).toBeVisible();
  await dialog.getByRole("button", { name: "Add application" }).click();
  await expect(page.getByText("Application added", { exact: true })).toBeVisible();
  await expect.poll(() => stub.researchPosts).toBe(1);

  // Open the new company in the app (the store survives) while its research is in flight.
  await page.getByRole("link", { name: "Companies" }).first().click();
  await page.getByText(LINEAR.name, { exact: true }).first().click();
  await expect(page).toHaveURL(new RegExp(`/companies/${LINEAR.id}$`));
  await expect(page.getByRole("heading", { name: "AI Research" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Run research" })).toHaveCount(0);

  gate.release();
  await expect(page.getByRole("button", { name: "Re-run" })).toBeVisible();
  await expect(page.getByText("Good pay")).toBeVisible();
  expect(stub.researchPosts).toBe(1);
});
