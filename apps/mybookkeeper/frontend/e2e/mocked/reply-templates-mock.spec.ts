/**
 * No-backend E2E for loading, archiving and restoring reply templates on /reply-templates.
 *
 * Fully mocks the API via page.route() with a small stateful fake of the
 * reply-templates endpoints, so it runs under playwright.layout.config.ts in
 * the `frontend-layout-e2e` CI job.
 *
 * Verifies:
 *   - A failed load of either tab says so (never "none"), and Try again loads the list.
 *   - The Active tab's skeleton matches the loaded rows and their Edit / Archive buttons.
 *   - A viewer gets no New / Edit / Archive, and reads a template through View.
 *   - The Archived tab is linkable, survives a reload, and hides New template.
 *   - Restore moves the template back to Active and sends is_archived=false.
 *   - A 502 after the server restored it is settled by reloading the list.
 *   - Archive moves a template to Archived, and a 502 after the server archived it
 *     is settled the same way.
 *   - The skeleton matches the loaded list's rows; Restore is at least 44px tall;
 *     no horizontal overflow at mobile / tablet / desktop widths.
 */
import type { Page, Request } from "@playwright/test";
import { test, expect } from "@platform/ui/test-support/crashGuard";
import type { OrgRole } from "@mybookkeeper/api-client/types/organization/OrgRole";
import { ORG_ID, plantAuth, stubWorkspaceShell } from "./fixtures/mockSession";
import { json } from "@platform/ui/test-support/mockResponse";
import { stubUnmatchedApi } from "@platform/ui/test-support/mockSession";

// Registered first, so every stub below wins over it. Any call this spec does
// not stub (the sidebar's integrations and review-queue reads, say) gets an
// empty answer instead of reaching the absent backend.
test.beforeEach(async ({ page }) => {
  await stubUnmatchedApi(page, { answer: "empty" });
});

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

async function stubShell(page: Page, orgRole: OrgRole = "owner"): Promise<void> {
  await stubWorkspaceShell(page, orgRole);
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
  /** Answers every list read with a 500. */
  failListReads: boolean;
}

async function stubTemplates(page: Page, rows: FakeTemplate[]): Promise<FakeServer> {
  const server: FakeServer = { rows, patches: [], deletes: [], gatewayAfterWrite: false, readDelayMs: 0, failListReads: false };
  await page.route("**/api/reply-templates**", async (route, request: Request) => {
    const url = new URL(request.url());
    if (request.method() === "GET" && url.pathname.endsWith("/reply-templates")) {
      if (server.readDelayMs > 0) await new Promise((r) => setTimeout(r, server.readDelayMs));
      if (server.failListReads) {
        await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ detail: "boom" }) });
        return;
      }
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

test.describe("Loading reply templates", () => {
  for (const [tab, path, rowPrefix] of [
    ["Active", "/reply-templates", "reply-template-row-"],
    ["Archived", "/reply-templates?view=archived", "archived-reply-template-row-"],
  ] as const) {
    test(`the ${tab} tab says it couldn't load, never "none", and Try again loads it`, async ({ page }) => {
      await plantAuth(page);
      await stubShell(page);
      const server = await stubTemplates(page, freshRows());
      server.failListReads = true;
      await page.goto(path);
      await expect(page.getByRole("alert").filter({ hasText: /couldn't load your/ })).toBeVisible({ timeout: 10000 });
      await expect(page.getByText(/No templates yet|No archived templates/)).toHaveCount(0);
      await expect(page.locator(`[data-testid^="${rowPrefix}"]`)).toHaveCount(0);

      server.failListReads = false;
      await page.getByRole("button", { name: "Try again" }).click();
      await expect(page.locator(`[data-testid^="${rowPrefix}"]`)).toHaveCount(1);
      await expect(page.getByRole("alert").filter({ hasText: /couldn't load your/ })).toHaveCount(0);
    });
  }

  // REPLY_TEMPLATE_SKELETON_ROWS (4) placeholder rows against 4 loaded ones.
  test("the Active skeleton has the loaded list's rows and buttons", async ({ page }) => {
    const rows = ["c1", "c2", "c3", "c4"].map((n, i) =>
      template(`00000000-0000-0000-0000-0000000000${n}`, `Active ${i + 1}`, false),
    );
    await plantAuth(page);
    await stubShell(page);
    const server = await stubTemplates(page, rows);
    server.readDelayMs = 1500;
    await page.goto("/reply-templates");
    const skeleton = page.getByTestId("active-reply-templates-skeleton");
    await expect(skeleton).toBeVisible();
    const skeletonRows = await skeleton.locator("li").count();
    const skeletonButtons = await skeleton.getByTestId("reply-templates-skeleton-action").count();
    await expect(page.getByText("Active 1", { exact: true })).toBeVisible({ timeout: 5000 });
    expect(skeletonRows).toBe(await page.locator('[data-testid^="reply-template-row-"]').count());
    const loadedButtons = await page.locator('[data-testid^="reply-template-edit-"], [data-testid^="reply-template-archive-"]').count();
    expect(skeletonButtons).toBe(loadedButtons);
  });
});

test.describe("Reply templates for a viewer", () => {
  test("offers View instead of New, Edit and Archive, and shows the whole template", async ({ page }) => {
    await plantAuth(page);
    await stubShell(page, "viewer");
    const server = await stubTemplates(page, freshRows());
    await page.goto("/reply-templates");
    await expect(page.getByTestId(`reply-template-row-${ACTIVE.id}`)).toBeVisible();
    await expect(page.getByText("View only. Ask a workspace admin to edit templates.", { exact: true })).toBeVisible();
    await expect(page.getByTestId("reply-template-new-button")).toHaveCount(0);
    await expect(page.getByRole("button", { name: `Edit ${ACTIVE.name}` })).toHaveCount(0);
    await expect(page.getByRole("button", { name: `Archive ${ACTIVE.name}` })).toHaveCount(0);

    await page.getByRole("button", { name: `View ${ACTIVE.name}` }).click();
    const view = page.getByTestId("reply-template-view");
    await expect(view).toContainText(ACTIVE.subject_template);
    await expect(view).toContainText("Hi $name");
    await expect(view.getByRole("textbox")).toHaveCount(0);
    await view.getByRole("button", { name: "Close", exact: true }).click();
    await expect(view).toHaveCount(0);
    expect(server.patches).toEqual([]);
    expect(server.deletes).toEqual([]);
  });
});

test.describe("Reply template panel", () => {
  test("is a named dialog that keeps focus inside and returns it on Escape", async ({ page }) => {
    const server = await openPage(page, freshRows(), "/reply-templates");
    const edit = page.getByRole("button", { name: `Edit ${ACTIVE.name}` });
    await edit.click();

    const dialog = page.getByRole("dialog", { name: "Edit template" });
    await expect(dialog).toBeVisible();
    await expect(page.getByRole("heading", { name: "Edit template" })).toHaveCount(1);
    for (let i = 0; i < 8; i += 1) {
      await page.keyboard.press("Tab");
      expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    }

    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(edit).toBeFocused();
    expect(server.patches).toEqual([]);
  });

  test("on a phone, closing the drawer returns focus to Edit", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openPage(page, freshRows(), "/reply-templates");
    const edit = page.getByRole("button", { name: `Edit ${ACTIVE.name}` });
    await edit.click();

    const dialog = page.getByRole("dialog", { name: "Edit template" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Close panel" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(edit).toBeFocused();
  });
});

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

  test("keeps keyboard focus in the list: the next template's Archive, then New template", async ({ page }) => {
    const SECOND = template("00000000-0000-0000-0000-0000000000a3", "Decline", false);
    const server = await openPage(page, [{ ...ACTIVE }, { ...SECOND }], "/reply-templates");
    await expect(page.getByTestId(`reply-template-row-${SECOND.id}`)).toBeVisible();
    // Hold the list reload so the row is removed after the dialog has closed, as on a real network.
    server.readDelayMs = 400;
    const firstArchive = page.getByTestId(`reply-template-archive-${ACTIVE.id}`);
    await firstArchive.focus();
    await page.keyboard.press("Enter");
    await page.getByRole("button", { name: "Archive", exact: true }).press("Enter");
    await expect(page.getByTestId(`reply-template-row-${ACTIVE.id}`)).toHaveCount(0);
    await expect(page.getByTestId(`reply-template-archive-${SECOND.id}`)).toBeFocused();

    await page.keyboard.press("Enter");
    await page.getByRole("button", { name: "Archive", exact: true }).press("Enter");
    await expect(page.getByTestId(`reply-template-row-${SECOND.id}`)).toHaveCount(0);
    await expect(page.getByTestId("reply-template-new-button")).toBeFocused();
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
    const skeletonButtons = await skeleton.getByTestId("reply-templates-skeleton-action").count();
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
