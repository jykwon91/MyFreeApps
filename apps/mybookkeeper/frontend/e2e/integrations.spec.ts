/**
 * Integrations page: Gmail connect / disconnect, sync sessions and the email
 * queue.
 *
 * Every describe block runs in its own fresh organization, so each starts from a
 * known state. A real Gmail connection and sync need Google, which the E2E stack
 * can't reach, so the connected organizations get their integration through
 * /test/seed-gmail-integration and their sync history and queue through
 * /test/seed-gmail-sync. Nothing here starts a real sync.
 */
import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { seededOrg } from "./fixtures/seeded-org";

const FAKE_ID = "00000000-0000-0000-0000-000000000000";

type SyncStatus = "running" | "success" | "failed" | "partial" | "cancelled";
type QueueStatus = "pending" | "fetched" | "done" | "failed" | "skipped";

interface SeedQueueItem {
  email_subject: string;
  attachment_filename?: string;
  status: QueueStatus;
  error?: string;
}

interface SeededSync {
  sync_log_id: number;
  queue_item_ids: string[];
}

interface SyncLog {
  id: number;
  status: string;
  records_added: number;
  started_at: string;
  completed_at: string | null;
  cancelled_at: string | null;
}

interface QueueItem {
  id: string;
  sync_log_id: number;
  email_subject: string | null;
  attachment_filename: string | null;
  status: string;
  error: string | null;
}

async function connectGmail(api: APIRequestContext): Promise<void> {
  const res = await api.post("/test/seed-gmail-integration", { data: {} });
  expect(res.status(), await res.text()).toBe(204);
}

async function seedSync(
  api: APIRequestContext,
  status: SyncStatus,
  queue: SeedQueueItem[] = [],
  recordsAdded = 0,
): Promise<SeededSync> {
  const res = await api.post("/test/seed-gmail-sync", {
    data: { status, records_added: recordsAdded, queue },
  });
  expect(res.status(), await res.text()).toBe(201);
  return (await res.json()) as SeededSync;
}

async function getJson<T>(api: APIRequestContext, path: string): Promise<T> {
  const res = await api.get(path);
  expect(res.status(), await res.text()).toBe(200);
  return (await res.json()) as T;
}

async function openIntegrations(page: Page, signIn: (page: Page) => Promise<void>): Promise<void> {
  await signIn(page);
  await page.goto("/integrations");
  await expect(page.getByRole("heading", { name: "Integrations" })).toBeVisible({ timeout: 15000 });
}

test.describe("Gmail — not connected", () => {
  const org = seededOrg("integrations-none");

  test("the API lists no integrations", async () => {
    expect(await getJson(org().api, "/integrations")).toEqual([]);
  });

  test("offers to connect and hides the connected-only controls", async ({ page }) => {
    await openIntegrations(page, (p) => org().signIn(p));

    await expect(page.getByText(/automatically import documents from your inbox/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole("button", { name: /^connect gmail$/i })).toBeEnabled();
    await expect(page.getByRole("button", { name: /sync now/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^disconnect$/i })).toHaveCount(0);
    await expect(page.getByPlaceholder(/e\.g\. receipts/i)).toHaveCount(0);
    await expect(page.getByText("Sync Sessions")).toHaveCount(0);
  });

  test("Connect Gmail opens Google's consent screen for read access", async ({ page, context }) => {
    // Answer the popup locally so the test never leaves the E2E stack.
    await context.route("https://accounts.google.com/**", (route) =>
      route.fulfill({ status: 200, contentType: "text/html", body: "<html><body>consent</body></html>" }),
    );
    await openIntegrations(page, (p) => org().signIn(p));

    const popup = page.waitForEvent("popup");
    await page.getByRole("button", { name: /^connect gmail$/i }).click();
    const consent = await popup;

    const url = new URL(consent.url());
    expect(url.origin).toBe("https://accounts.google.com");
    expect(url.searchParams.get("scope")).toContain("https://www.googleapis.com/auth/gmail.readonly");
    expect(url.searchParams.get("response_type")).toBe("code");
    await consent.close();
  });
});

test.describe("Gmail — connected with sync history", () => {
  let older: SeededSync;
  let latest: SeededSync;
  const org = seededOrg("integrations-history", async (api) => {
    await connectGmail(api);
    older = await seedSync(api, "success", [
      { email_subject: "E2E Done receipt", attachment_filename: "done.pdf", status: "done" },
    ], 1);
    latest = await seedSync(api, "partial", [
      { email_subject: "E2E Fetched invoice A", attachment_filename: "a.pdf", status: "fetched" },
      { email_subject: "E2E Fetched invoice B", attachment_filename: "b.pdf", status: "fetched" },
      { email_subject: "E2E Broken receipt", attachment_filename: "broken.pdf", status: "failed", error: "E2E could not read" },
    ]);
  });

  test("the API lists the integration, its sync sessions newest first, and their queue", async () => {
    const integrations = await getJson<{ provider: string }[]>(org().api, "/integrations");
    expect(integrations.map((i) => i.provider)).toEqual(["gmail"]);

    const logs = await getJson<SyncLog[]>(org().api, "/integrations/gmail/logs");
    expect(logs.map((l) => [l.id, l.status, l.records_added])).toEqual([
      [latest.sync_log_id, "partial", 0],
      [older.sync_log_id, "success", 1],
    ]);
    expect(logs.every((l) => l.started_at && l.completed_at)).toBe(true);

    const queue = await getJson<QueueItem[]>(org().api, "/integrations/gmail/queue");
    const bySubject = Object.fromEntries(queue.map((q) => [q.email_subject, [q.sync_log_id, q.status, q.error]]));
    expect(bySubject).toEqual({
      "E2E Done receipt": [older.sync_log_id, "done", null],
      "E2E Fetched invoice A": [latest.sync_log_id, "fetched", null],
      "E2E Fetched invoice B": [latest.sync_log_id, "fetched", null],
      "E2E Broken receipt": [latest.sync_log_id, "failed", "E2E could not read"],
    });
  });

  test("dismissing or retrying a queue item that doesn't exist is a 404", async () => {
    expect((await org().api.delete(`/integrations/gmail/queue/${FAKE_ID}`)).status()).toBe(404);
    expect((await org().api.post(`/integrations/gmail/queue/${FAKE_ID}/retry`)).status()).toBe(404);
  });

  test("retrying an item that hasn't failed is rejected", async () => {
    const res = await org().api.post(`/integrations/gmail/queue/${latest.queue_item_ids[0]}/retry`);
    expect(res.status()).toBe(400);
  });

  test("shows the connection, never synced through the integration itself", async ({ page }) => {
    await openIntegrations(page, (p) => org().signIn(p));

    await expect(page.getByText("Connected · Last synced never")).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole("button", { name: /^connect gmail$/i })).toHaveCount(0);
  });

  test("Sync now asks first, and No leaves it unstarted", async ({ page }) => {
    await openIntegrations(page, (p) => org().signIn(p));
    let syncCalled = false;
    page.on("request", (r) => {
      if (r.method() === "POST" && r.url().endsWith("/integrations/gmail/sync")) syncCalled = true;
    });

    await page.getByRole("button", { name: /sync now/i }).click();
    await expect(page.getByText("Start email sync?")).toBeVisible();
    await page.getByRole("button", { name: /^no$/i }).click();

    await expect(page.getByText("Start email sync?")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /sync now/i })).toBeEnabled();
    expect(syncCalled).toBe(false);
  });

  test("Disconnect asks first, and No keeps the connection", async ({ page }) => {
    await openIntegrations(page, (p) => org().signIn(p));

    await page.getByRole("button", { name: /^disconnect$/i }).click();
    await expect(page.getByText("Disconnect Gmail?")).toBeVisible();
    await page.getByRole("button", { name: /^no$/i }).click();

    await expect(page.getByRole("button", { name: /^disconnect$/i })).toBeVisible();
    const integrations = await getJson<{ provider: string }[]>(org().api, "/integrations");
    expect(integrations.map((i) => i.provider)).toEqual(["gmail"]);
  });

  test("the label filter enables Save only when the label changes", async ({ page }) => {
    await openIntegrations(page, (p) => org().signIn(p));
    const input = page.getByPlaceholder(/e\.g\. receipts/i);
    const save = page.getByRole("button", { name: /^save$/i });

    await expect(input).toHaveValue("");
    await expect(page.getByText("Leave empty to sync all emails")).toBeVisible();
    await expect(save).toBeDisabled();
    await input.fill("Receipts");
    await expect(save).toBeEnabled();
    await input.fill("");
    await expect(save).toBeDisabled();
  });

  test("lists the sync sessions newest first, with the newest open", async ({ page }) => {
    await openIntegrations(page, (p) => org().signIn(p));

    await expect(page.getByText("Sync Sessions")).toBeVisible({ timeout: 10000 });
    const rows = page.getByRole("button").filter({ hasText: /^#\d+/ });
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText(`#${latest.sync_log_id}`);
    await expect(rows.nth(0)).toContainText("(3 items)");
    await expect(rows.nth(1)).toContainText(`#${older.sync_log_id}`);
    await expect(rows.nth(1)).toContainText("(1 item)");

    // Only the newest session is open: its items show, the older one's don't.
    await expect(page.getByText("Started")).toHaveCount(1);
    await expect(page.getByText("E2E Broken receipt")).toBeVisible();
    await expect(page.getByText("E2E could not read")).toBeVisible();
    await expect(page.getByText("E2E Done receipt")).toHaveCount(0);

    await rows.nth(1).click();
    await expect(page.getByText("E2E Done receipt")).toBeVisible();
    await expect(page.getByText("Started")).toHaveCount(2);

    await rows.nth(0).click();
    await expect(page.getByText("E2E Broken receipt")).toHaveCount(0);
    await expect(page.getByText("Started")).toHaveCount(1);
  });

  test("offers to extract the fetched items and retry the failed one", async ({ page }) => {
    await openIntegrations(page, (p) => org().signIn(p));

    await expect(page.getByRole("button", { name: "Extract All (2)" })).toBeEnabled({ timeout: 10000 });
    await expect(page.getByRole("button", { name: "Retry Failed (1)" })).toBeEnabled();
  });
});

test.describe("Gmail — retrying failed items", () => {
  let sync: SeededSync;
  const org = seededOrg("integrations-retry", async (api) => {
    await connectGmail(api);
    sync = await seedSync(api, "partial", [
      { email_subject: "E2E Failed one", status: "failed", error: "E2E timeout" },
      { email_subject: "E2E Failed two", status: "failed", error: "E2E timeout" },
    ]);
  });

  test("retrying one item queues it to be fetched again", async () => {
    const res = await org().api.post(`/integrations/gmail/queue/${sync.queue_item_ids[0]}/retry`);
    expect(res.status(), await res.text()).toBe(200);
    expect(await res.json()).toEqual({ id: sync.queue_item_ids[0], status: "pending" });
  });

  test("Retry Failed queues every failed item again", async ({ page }) => {
    await openIntegrations(page, (p) => org().signIn(p));
    const retry = page.getByRole("button", { name: /^Retry Failed \(\d+\)$/ });
    await expect(retry).toBeVisible({ timeout: 10000 });

    const saved = page.waitForResponse(
      (r) => r.request().method() === "POST" && r.url().endsWith("/integrations/gmail/queue/retry-all"),
    );
    await retry.click();
    const res = await saved;

    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
    await expect(retry).toHaveCount(0, { timeout: 10000 });
    const queue = await getJson<QueueItem[]>(org().api, "/integrations/gmail/queue");
    expect(queue.map((q) => [q.email_subject, q.status, q.error]).sort()).toEqual([
      ["E2E Failed one", "pending", null],
      ["E2E Failed two", "pending", null],
    ]);
  });
});

test.describe("Gmail — a sync in progress", () => {
  let running: SeededSync;
  const org = seededOrg("integrations-running", async (api) => {
    await connectGmail(api);
    running = await seedSync(api, "running");
  });

  test("starting another sync is refused while one runs", async () => {
    const res = await org().api.post("/integrations/gmail/sync");
    expect(res.status()).toBe(409);
  });

  test("shows the running sync, and Cancel asks it to stop", async ({ page }) => {
    await openIntegrations(page, (p) => org().signIn(p));
    await expect(page.getByRole("button", { name: "Syncing...", exact: true })).toBeDisabled({ timeout: 10000 });
    await expect(page.getByRole("button", { name: "Cancel this sync" })).toBeVisible();

    const cancelled = page.waitForResponse(
      (r) => r.request().method() === "POST" && r.url().endsWith("/integrations/gmail/sync/cancel"),
    );
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    const res = await cancelled;

    // Cancelling is cooperative: the sync's worker sees the request and ends the
    // session as cancelled. The request itself is recorded on the session.
    expect(res.status()).toBe(204);
    expect(JSON.parse(res.request().postData() ?? "{}")).toEqual({ sync_log_id: running.sync_log_id });
    const logs = await getJson<SyncLog[]>(org().api, "/integrations/gmail/logs");
    expect(logs.map((l) => [l.id, l.status, l.cancelled_at !== null])).toEqual([[running.sync_log_id, "running", true]]);
  });
});

test.describe("Gmail — disconnecting", () => {
  const org = seededOrg("integrations-disconnect", connectGmail);

  test("Disconnect → Yes removes the connection and offers to connect again", async ({ page }) => {
    await openIntegrations(page, (p) => org().signIn(p));

    await page.getByRole("button", { name: /^disconnect$/i }).click();
    await expect(page.getByText("Disconnect Gmail?")).toBeVisible();
    const removed = page.waitForResponse(
      (r) => r.request().method() === "DELETE" && r.url().endsWith("/integrations/gmail"),
    );
    await page.getByRole("button", { name: /^yes$/i }).click();
    expect((await removed).status()).toBe(204);

    await expect(page.getByRole("button", { name: /^connect gmail$/i })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/automatically import documents from your inbox/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /^disconnect$/i })).toHaveCount(0);
    expect(await getJson(org().api, "/integrations")).toEqual([]);
    expect((await org().api.delete("/integrations/gmail")).status()).toBe(404);
  });
});
