/**
 * No-backend E2E for an analysis whose application is deleted. Adding it to Applications marks the
 * result saved; deleting that application on its detail page takes the mark off, so coming back to
 * Analyze offers "Add to applications" again instead of a Saved line that can no longer be acted on.
 * The whole trip stays inside the app (no reload), because the result lives in memory.
 */
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { json } from "@platform/ui/test-support/mockResponse";
import { stubSignedInShell } from "@platform/ui/test-support/mockSession";
import { mockApplication, mockCompany } from "./fixtures/mockData";

const APPLICATION = mockApplication({ role_title: "Staff Engineer" });
const ANALYSIS_ID = "analysis-1";
const ANALYSIS = {
  id: ANALYSIS_ID,
  user_id: APPLICATION.user_id,
  source_url: null,
  jd_text: "Staff Engineer at Acme",
  fingerprint: "f",
  extracted: {
    title: "Staff Engineer",
    company: "Acme Corp",
    location: null,
    remote_type: null,
    posted_salary_min: null,
    posted_salary_max: null,
    posted_salary_currency: null,
    posted_salary_period: null,
    summary: null,
  },
  verdict: "good_fit",
  verdict_summary: "A solid match.",
  dimensions: [],
  red_flags: [],
  green_flags: [],
  total_tokens_in: 0,
  total_tokens_out: 0,
  total_cost_usd: 0,
  applied_application_id: null,
  created_at: "2026-11-01T00:00:00Z",
  updated_at: "2026-11-01T00:00:00Z",
};

test("after its application is deleted, the analysis offers Add to applications again", async ({ page }) => {
  await stubSignedInShell(page);
  let deleted = false;
  const applies: string[] = [];
  await page.route(/\/api\/jobs\/analyze$/, (route) => route.fulfill(json(ANALYSIS, 201)));
  await page.route(new RegExp(`/api/jobs/analyze/${ANALYSIS_ID}/apply$`), (route) => {
    applies.push(route.request().url());
    return route.fulfill(json({ id: APPLICATION.id }, 201));
  });
  await page.route(new RegExp(`/api/applications/${APPLICATION.id}$`), (route) => {
    if (route.request().method() === "DELETE") {
      deleted = true;
      return route.fulfill({ status: 204 });
    }
    return route.fulfill(json({ ...APPLICATION, events: [], contacts: [] }));
  });
  await page.route(/\/api\/applications(\?|$)/, (route) =>
    route.fulfill(json(deleted ? { items: [], total: 0 } : { items: [APPLICATION], total: 1 })),
  );
  await page.route(/\/api\/applications\?view=kanban/, (route) => route.fulfill(json({ items: [], total: 0 })));
  await page.route(new RegExp(`/api/applications/${APPLICATION.id}/events`), (route) =>
    route.fulfill(json({ items: [], total: 0 })),
  );
  await page.route(/\/api\/documents(\?|$)/, (route) => route.fulfill(json({ items: [], total: 0 })));
  await page.route(new RegExp(`/api/companies/${APPLICATION.company_id}$`), (route) => route.fulfill(json(mockCompany())));

  await page.goto("/analyze");
  await page.getByRole("button", { name: "No URL? Paste the description text instead." }).click();
  await page.getByLabel("Job description text").fill("Staff Engineer at Acme. ".repeat(20));
  await page.getByRole("button", { name: "Analyze this job" }).click();
  await page.getByRole("button", { name: "Add to applications" }).click();
  await expect(page).toHaveURL(/\/applications$/);

  await page.getByRole("cell", { name: "Staff Engineer" }).click();
  await page.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.getByRole("link", { name: "Analyze a job" }).first().click();
  await expect(page.getByRole("button", { name: "Add to applications" })).toBeVisible();
  await expect(page.getByText("Saved to your applications.")).toHaveCount(0);
});

test("while its application still exists, the analysis keeps saying it is saved", async ({ page }) => {
  await stubSignedInShell(page);
  await page.route(/\/api\/jobs\/analyze$/, (route) => route.fulfill(json(ANALYSIS, 201)));
  await page.route(new RegExp(`/api/jobs/analyze/${ANALYSIS_ID}/apply$`), (route) =>
    route.fulfill(json({ id: APPLICATION.id }, 201)),
  );
  await page.route(/\/api\/applications(\?|$)/, (route) => route.fulfill(json({ items: [APPLICATION], total: 1 })));
  await page.route(/\/api\/applications\?view=kanban/, (route) => route.fulfill(json({ items: [], total: 0 })));

  await page.goto("/analyze");
  await page.getByRole("button", { name: "No URL? Paste the description text instead." }).click();
  await page.getByLabel("Job description text").fill("Staff Engineer at Acme. ".repeat(20));
  await page.getByRole("button", { name: "Analyze this job" }).click();
  await page.getByRole("button", { name: "Add to applications" }).click();
  await expect(page).toHaveURL(/\/applications$/);

  await page.getByRole("link", { name: "Analyze a job" }).first().click();
  await expect(page.getByText("Saved to your applications.")).toBeVisible();
});
