/**
 * No-backend E2E for archiving and restoring reply templates on /reply-templates.
 *
 * Fully mocks the API via page.route() with a small stateful fake of the
 * reply-templates endpoints, so it runs under playwright.layout.config.ts in
 * the `frontend-layout-e2e` CI job.
 *
 * Verifies:
 *   - The Archived tab is linkable, survives a reload, and hides New template.
 *   - Restore moves the template back to Active and sends is_archived=false.
 *   - A 502 after the server restored it is settled by reloading the list.
 *   - Archive moves a template to Archived, and a 502 after the server archived it
 *     is settled the same way.
 *   - The skeleton matches the loaded list's rows; Restore is at least 44px tall;
 *     no horizontal overflow at mobile / tablet / desktop widths.
 */
import { test, expect, type Page, type Request } from "@playwright/test";

const ORG_ID = "00000000-0000-0000-0000-000000000010";

interface FakeTemplate {
  id: string;
  name: string;
  subject_template: string;
  is_archived: boolean;
}

function template(id: string, name: string, isArchived: boolean): FakeTemplate {
  return { id, name, subject_template: `About $listing (${name})`, is_archived: isArchived };
}

function asResponse(row: FakeTemplate) {
  return {
    ...row,
    organization_id: ORG_ID,
    user_id: "00000000-0000-0000-0000-000000000001",
    body_template: "Hi $name",
    display_order: 0,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

function plantAuth(page: Page): Promise<void> {
  return page.addInitScript(
    ([orgId]) => {
      const futureExp = Math.floor(Date.now() / 1000) + 3600;
      const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
      const payload = btoa(JSON.stringify({ sub: "test-user", exp: futureExp }));
      window.localStorage.setItem("token", `${header}.${payload}.fake-signature`);
      window.localStorage.setItem("v1_activeOrgId", orgId);
    },
    [ORG_ID],
  );
}

async function stubShell(page: Page): Promise<void> {
  const json = (body: unknown) => ({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
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
    route.fulfill(json([{ id: ORG_ID, name: "Test Workspace", role: "owner", org_role: "owner" }])),
  );
  await page.route("**/api/version", (route) => route.fulfill(json({ version: "test" })));
  await page.route("**/api/tax-profile", (route) =>
    route.fulfill(json({ onboarding_completed: true, tax_situations: [], filing_status: null, dependents_count: 0 })),
  );
  await page.route("**/api/properties", (route) => route.fulfill(json([])));
}

interface FakeServer {
  rows: FakeTemplate[];
  patches: unknown[];
  /** Restores or archives, then answers like a proxy that lost the backend's reply. */
  gatewayAfterWrite: boolean;
  deletes: string[];
  /** Holds every list read this long. */
  readDelayMs: number;
}

async function stubTemplates(page: Page, rows: FakeTemplate[]): Promise<FakeServer> {
  const server: FakeServer = { rows, patches: [], deletes: [], gatewayAfterWrite: false, readDelayMs: 0 };
  await page.route("**/api/reply-templates**", async (route, request: Request) => {
    const url = new URL(request.url());
    if (request.method() === "GET" && url.pathname.endsWith("/reply-templates")) {
      if (server.readDelayMs > 0) await new Promise((r) => setTimeout(r, server.readDelayMs));
      const withArchived = url.searchParams.get("include_archived") === "true";
      const listed = server.rows.filter((row) => withArchived || !row.is_archived);
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(listed.map(asResponse)) });
      return;
    }
    if (request.method() === "PATCH") {
      const id = url.pathname.split("/").at(-1);
      const sent = request.postDataJSON() as { is_archived?: boolean };
      server.patches.push(sent);
      const row = server.rows.find((candidate) => candidate.id === id);
      if (!row || (row.is_archived && sent.is_archived !== false)) {
        await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ detail: "Reply template not found" }) });
        return;
      }
      row.is_archived = sent.is_archived ?? row.is_archived;
      if (server.gatewayAfterWrite) {
        await route.fulfill({ status: 502, contentType: "text/html", body: "<html>502 Bad Gateway</html>" });
        return;
      }
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(asResponse(row)) });
      return;
    }
    if (request.method() === "DELETE") {
      const id = url.pathname.split("/").at(-1) ?? "";
      server.deletes.push(id);
      const row = server.rows.find((candidate) => candidate.id === id && !candidate.is_archived);
      if (!row) {
        await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ detail: "Reply template not found" }) });
        return;
      }
      row.is_archived = true;
      if (server.gatewayAfterWrite) {
        await route.fulfill({ status: 502, contentType: "text/html", body: "<html>502 Bad Gateway</html>" });
        return;
      }
      await route.fulfill({ status: 204, body: "" });
      return;
    }
    await route.fulfill({ status: 404, body: "" });
  });
  return server;
}

async function openPage(page: Page, rows: FakeTemplate[], path = "/reply-templates?view=archived"): Promise<FakeServer> {
  await plantAuth(page);
  await stubShell(page);
  const server = await stubTemplates(page, rows);
  await page.goto(path);
  return server;
}

const ACTIVE = template("00000000-0000-0000-0000-0000000000a1", "Initial reply", false);
const ARCHIVED = template("00000000-0000-0000-0000-0000000000a2", "Old decline", true);

function freshRows(): FakeTemplate[] {
  return [{ ...ACTIVE }, { ...ARCHIVED }];
}

test.describe("Restoring archived reply templates", () => {
  test("restores from the Archived tab and shows it on Active", async ({ page }) => {
    const server = await openPage(page, freshRows());
    await expect(page.getByRole("tab", { name: "Archived" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("reply-template-new-button")).toHaveCount(0);
    await expect(page.getByText("Old decline", { exact: true })).toBeVisible();
    await expect(page.getByText("Initial reply", { exact: true })).toHaveCount(0);

    await page.getByRole("button", { name: "Restore Old decline" }).click();
    await expect(page.getByText("Restored. It's back in your templates.", { exact: true })).toBeVisible();
    await expect(page.getByTestId(`archived-reply-template-row-${ARCHIVED.id}`)).toHaveCount(0);
    expect(server.patches).toEqual([{ is_archived: false }]);
    expect(server.rows.find((row) => row.id === ARCHIVED.id)?.is_archived).toBe(false);

    await page.getByRole("tab", { name: "Active" }).click();
    await expect(page).toHaveURL(/\/reply-templates$/);
    await expect(page.getByTestId(`reply-template-row-${ARCHIVED.id}`)).toBeVisible();
    await expect(page.getByTestId(`reply-template-row-${ACTIVE.id}`)).toBeVisible();
  });

  test("keeps the Archived tab across a reload", async ({ page }) => {
    await openPage(page, freshRows(), "/reply-templates");
    await page.getByRole("tab", { name: "Archived" }).click();
    await expect(page).toHaveURL(/view=archived/);
    await page.reload();
    await expect(page.getByRole("tab", { name: "Archived" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByText("Old decline", { exact: true })).toBeVisible();
  });

  test("counts it as restored when the proxy fails after the server restored it", async ({ page }) => {
    const server = await openPage(page, freshRows());
    server.gatewayAfterWrite = true;
    await page.getByRole("button", { name: "Restore Old decline" }).click();
    await expect(page.getByText("Restored. It's back in your templates.", { exact: true })).toBeVisible();
    await expect(page.getByText(/Bad Gateway/)).toHaveCount(0);
    await expect(page.getByTestId(`archived-reply-template-row-${ARCHIVED.id}`)).toHaveCount(0);
  });

  test("says there are none, and goes back to Active", async ({ page }) => {
    await openPage(page, [{ ...ACTIVE }]);
    await expect(page.getByText(/No archived templates/)).toBeVisible();
    await page.getByRole("button", { name: "Back to active templates" }).click();
    await expect(page.getByTestId(`reply-template-row-${ACTIVE.id}`)).toBeVisible();
  });
});

test.describe("Archiving reply templates", () => {
  async function archiveInitialReply(page: Page) {
    await page.getByTestId(`reply-template-archive-${ACTIVE.id}`).click();
    await page.getByRole("button", { name: "Archive", exact: true }).click();
  }

  test("archives it and shows it on the Archived tab", async ({ page }) => {
    const server = await openPage(page, freshRows(), "/reply-templates");
    await archiveInitialReply(page);
    await expect(page.getByText("Template archived.", { exact: true })).toBeVisible();
    await expect(page.getByTestId(`reply-template-row-${ACTIVE.id}`)).toHaveCount(0);
    expect(server.deletes).toEqual([ACTIVE.id]);
    await page.getByRole("tab", { name: "Archived" }).click();
    await expect(page.getByTestId(`archived-reply-template-row-${ACTIVE.id}`)).toBeVisible();
  });

  test("counts it as archived when the proxy fails after the server archived it", async ({ page }) => {
    const server = await openPage(page, freshRows(), "/reply-templates");
    server.gatewayAfterWrite = true;
    await archiveInitialReply(page);
    await expect(page.getByText("Template archived.", { exact: true })).toBeVisible();
    await expect(page.getByText(/Bad Gateway/)).toHaveCount(0);
    await expect(page.getByRole("heading", { name: /Archive this template/i })).toHaveCount(0);
    await expect(page.getByTestId(`reply-template-row-${ACTIVE.id}`)).toHaveCount(0);
  });
});

test.describe("Archived reply templates layout", () => {
  const MANY = [
    { ...ACTIVE },
    template("00000000-0000-0000-0000-0000000000b1", "Archived one", true),
    template("00000000-0000-0000-0000-0000000000b2", "Archived two", true),
    template("00000000-0000-0000-0000-0000000000b3", "Archived three", true),
    template("00000000-0000-0000-0000-0000000000b4", "Archived four", true),
  ];

  // The skeleton always draws REPLY_TEMPLATE_SKELETON_ROWS (4) rows, so MANY holds
  // exactly 4 archived templates: the check is that each placeholder row has the
  // same shape (name, subject, a Restore button) as a loaded one.
  test("the skeleton has the loaded list's rows and button", async ({ page }) => {
    await plantAuth(page);
    await stubShell(page);
    const server = await stubTemplates(page, MANY.map((row) => ({ ...row })));
    server.readDelayMs = 1500;
    await page.goto("/reply-templates?view=archived");
    const skeleton = page.getByTestId("archived-reply-templates-skeleton");
    await expect(skeleton).toBeVisible();
    const skeletonRows = await skeleton.locator("li").count();
    const skeletonButtons = await skeleton.locator("li .h-11").count();
    await expect(page.getByText("Archived one", { exact: true })).toBeVisible({ timeout: 5000 });
    const loadedRows = await page.locator('[data-testid^="archived-reply-template-row-"]').count();
    expect(skeletonRows).toBe(loadedRows);
    expect(skeletonButtons).toBe(await page.getByRole("button", { name: /^Restore / }).count());
  });

  for (const width of [375, 768, 1280]) {
    test(`fits ${width}px wide with 44px Restore buttons`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await openPage(page, MANY.map((row) => ({ ...row })));
      const restore = page.getByRole("button", { name: "Restore Archived one" });
      await expect(restore).toBeVisible();
      const box = await restore.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }
});
