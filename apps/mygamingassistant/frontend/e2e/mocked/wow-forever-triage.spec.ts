/**
 * WoW Forever feature-request triage (/wow-forever/triage) — the operator signs in with their account
 * (signed out → /login → back here), the inbox with Approve / Undo, Merge, an All requests status change to
 * Shipped (path checked), Sign out sending a pending write and dropping every private row, a 401 mid-session
 * returning to sign in and back to the same place, the phone layout and the list skeleton. Login,
 * `/users/me` and the triage API are mocked; the triage mock answers 401 without the operator's Bearer
 * token. Every other /api call answers 404. No backend needed.
 *
 * Run: npx playwright test --config=playwright.layout.config.ts wow-forever-triage
 */
import { expect, test, type Page, type Request } from "@playwright/test";

const PAGE = "/wow-forever/triage";
const OPERATOR_EMAIL = "operator@fixture.example";
const OPERATOR_PASSWORD = "fixture-password-not-a-secret";
/** A JWT-shaped fixture (never signed; the app only reads `exp`). Standard base64, as the app's atob reads it. */
const FIXTURE_TOKEN = [
  Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64"),
  Buffer.from(JSON.stringify({ sub: "fixture-operator", exp: 4102444800 })).toString("base64"),
  "fixture-signature",
].join(".");
const UNDO_MS = 6000;

interface Story {
  id: string;
  title: string;
  persona: string;
  i_want: string;
  so_that: string;
  acceptance_criteria: string[];
  follow_ups: string[];
  area: string;
  topic: string | null;
  feasibility: string;
  feasibility_note: string | null;
  status: string;
  priority: number | null;
  operator_note: string | null;
  shipped_path: string | null;
  shipped_at: string | null;
  merged_into_id: string | null;
  vote_count: number;
  hidden: boolean;
  created_at: string;
  updated_at: string;
  submissions: unknown[];
}

interface Item {
  submission_id: string;
  verdict: string;
  untrusted_submission_text: string | null;
  untrusted_clarification_answer: string | null;
  context: Record<string, unknown>;
  claude_reason: string | null;
  nuance_note: string | null;
  parent_submission_id: string | null;
  model_id: string | null;
  story: Story | null;
  created_at: string;
}

function story(n: number, patch: Partial<Story> = {}): Story {
  const hex = n.toString(16).padStart(2, "0");
  return {
    id: `${hex}${hex}${hex}${hex}-0000-4000-8000-0000000000${hex}`,
    title: `Idea number ${n}`,
    persona: "new Warlock",
    i_want: `feature ${n}`,
    so_that: "I level faster",
    acceptance_criteria: [`Criterion for ${n}`],
    follow_ups: [],
    area: "professions",
    topic: null,
    feasibility: "feasible",
    feasibility_note: null,
    status: "open",
    priority: null,
    operator_note: null,
    shipped_path: null,
    shipped_at: null,
    merged_into_id: null,
    vote_count: 1,
    hidden: false,
    created_at: `2026-11-0${(n % 9) + 1}T00:00:00Z`,
    updated_at: `2026-11-05T00:00:0${n % 10}.123456+00:00`,
    submissions: [],
    ...patch,
  };
}

function item(n: number, s: Story | null, patch: Partial<Item> = {}): Item {
  const hex = n.toString(16).padStart(2, "0");
  return {
    submission_id: `5555${hex}${hex}-0000-4000-8000-0000000000${hex}`,
    verdict: "new",
    untrusted_submission_text: `Please add idea ${n}`,
    untrusted_clarification_answer: null,
    context: { class_id: "warlock", experience: null, level_band: null, professions: [], activities: [], faction: null },
    claude_reason: null,
    nuance_note: null,
    parent_submission_id: null,
    model_id: "claude-test",
    story: s,
    created_at: "2026-11-05T00:00:00Z",
    ...patch,
  };
}

interface Api {
  inbox: Item[];
  stories: Story[];
  requests: Request[];
  /** Hold GET /stories until released. */
  holdStories: Promise<void> | null;
  /** The server has expired the session: every triage call answers 401. */
  expired: boolean;
}

function writes(api: Api, method: string, pathPart: string): Request[] {
  return api.requests.filter((r) => r.method() === method && new URL(r.url()).pathname.includes(pathPart));
}

/** Mock login (the fixture operator), `/users/me` and the triage API (Bearer only); anything else under /api is 404. */
async function mockTriage(page: Page, api: Api): Promise<void> {
  await page.route(
    (url) => url.pathname.startsWith("/api/"),
    (route) => route.fulfill({ status: 404, json: { detail: "Not Found" } }),
  );
  await page.route("**/api/auth/totp/login", (route) => {
    const { email, password } = route.request().postDataJSON() as { email: string; password: string };
    if (email !== OPERATOR_EMAIL || password !== OPERATOR_PASSWORD) {
      return route.fulfill({ status: 400, json: { detail: "LOGIN_BAD_CREDENTIALS" } });
    }
    api.expired = false;
    return route.fulfill({ json: { access_token: FIXTURE_TOKEN, token_type: "bearer" } });
  });
  await page.route("**/api/users/me", (route) =>
    route.fulfill({
      json: { id: "fixture-operator", email: OPERATOR_EMAIL, is_active: true, is_superuser: true, is_verified: true },
    }),
  );
  await page.route("**/wow/feature-requests/triage/**", async (route) => {
    const request = route.request();
    api.requests.push(request);
    if (api.expired || request.headers()["authorization"] !== `Bearer ${FIXTURE_TOKEN}`) {
      return route.fulfill({ status: 401, json: { detail: "Unauthorized" } });
    }
    const path = new URL(request.url()).pathname.replace("/api/wow/feature-requests/triage", "");
    const method = request.method();
    if (method === "GET" && path === "/inbox") {
      return route.fulfill({ json: { items: api.inbox, total_untriaged: api.inbox.length } });
    }
    if (method === "GET" && path === "/stories") {
      if (api.holdStories !== null) await api.holdStories;
      return route.fulfill({ json: { items: api.stories } });
    }
    if (method === "PATCH" && path.startsWith("/stories/")) {
      const id = path.split("/")[2];
      const current = api.stories.find((s) => s.id === id) ?? api.inbox.find((i) => i.story?.id === id)?.story;
      if (current === undefined || current === null) return route.fulfill({ status: 404, json: { detail: "feature_request_not_found" } });
      if (request.headers()["if-match"] !== current.updated_at) return route.fulfill({ status: 412, json: { detail: "story_changed" } });
      const saved = { ...current, ...(request.postDataJSON() as Partial<Story>), updated_at: "2026-11-06T00:00:00.000001+00:00" };
      api.stories = api.stories.map((s) => (s.id === id ? saved : s));
      return route.fulfill({ json: saved });
    }
    if (method === "POST" && path.endsWith("/merge")) {
      const id = path.split("/")[2];
      const { into_story_id: into } = request.postDataJSON() as { into_story_id: string };
      api.stories = api.stories.map((s) => (s.id === id ? { ...s, status: "duplicate", merged_into_id: into } : s));
      return route.fulfill({ json: { merged_story_id: id, into_story_id: into } });
    }
    if (method === "POST" && path === "/submissions/mark-triaged") {
      const { submission_ids: ids } = request.postDataJSON() as { submission_ids: string[] };
      api.inbox = api.inbox.filter((i) => !ids.includes(i.submission_id));
      return route.fulfill({ json: { updated: ids.length } });
    }
    return route.fulfill({ status: 500, json: { detail: "unexpected" } });
  });
}

function newApi(inbox: Item[], stories: Story[]): Api {
  return { inbox, stories, requests: [], holdStories: null, expired: false };
}

/** On /login (sent there from triage): sign in as the fixture operator. */
async function fillSignIn(page: Page, password = OPERATOR_PASSWORD): Promise<void> {
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel("Email").fill(OPERATOR_EMAIL);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

async function signIn(page: Page, target = PAGE): Promise<void> {
  await page.goto(target);
  await fillSignIn(page);
  await expect(page.getByTestId("triage-workspace")).toBeVisible();
}

const workspace = (page: Page) => page.getByTestId("triage-workspace");

const card = (page: Page, text: string) => page.locator('[data-section="inbox-card"]').filter({ hasText: text });

test("sign in, approve, undo, approve again, and a pending approve is sent by Sign out", async ({ page }) => {
  const first = story(1, { status: "submitted", title: "Herb spawn map" });
  const second = story(2, { status: "submitted", title: "Raid signups in Discord", area: "dungeons_raids" });
  const api = newApi([item(1, first), item(2, second)], [first, second]);
  await mockTriage(page, api);

  // Signed out: the triage page sends you to sign in and calls nothing; a wrong password stays there.
  await page.goto(PAGE);
  await fillSignIn(page, "fixture-wrong-password");
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
  expect(api.requests).toHaveLength(0);
  await fillSignIn(page);
  await expect(page).toHaveURL(new RegExp(`${PAGE}$`));
  await expect(page.getByRole("heading", { name: "2 ideas waiting for you" })).toBeVisible();
  await expect(card(page, "Herb spawn map").getByText("Player wrote — untrusted")).toBeVisible();

  // Approve, then Undo inside the window: nothing is sent.
  await card(page, "Herb spawn map").getByRole("button", { name: "Approve" }).click();
  await expect(page.getByTestId("triage-undo-bar")).toContainText("Herb spawn map");
  await page.getByTestId("triage-undo-bar").getByRole("button", { name: "Undo" }).click();
  await expect(card(page, "Herb spawn map").getByRole("button", { name: "Approve" })).toBeVisible();
  await page.waitForTimeout(500);
  expect(writes(api, "PATCH", "/stories/")).toHaveLength(0);

  // Approve again with a priority: sent once the window passes, PATCH before mark-triaged.
  await card(page, "Herb spawn map").getByRole("radio", { name: "P1" }).click();
  await card(page, "Herb spawn map").getByRole("button", { name: "Approve" }).click();
  await expect.poll(() => writes(api, "POST", "/mark-triaged").length, { timeout: UNDO_MS + 4000 }).toBe(1);
  const [patch] = writes(api, "PATCH", "/stories/");
  expect(patch.postDataJSON()).toEqual({ status: "open", priority: 1 });
  expect(patch.headers()["if-match"]).toBe(first.updated_at);
  await expect(page.getByText("Approved. It's on the board.", { exact: true })).toBeVisible();
  await expect(card(page, "Herb spawn map")).toHaveCount(0);

  // A second approve still in its window is sent straight away when the operator signs out.
  await card(page, "Raid signups in Discord").getByRole("button", { name: "Approve" }).click();
  await workspace(page).getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect(writes(api, "PATCH", `/stories/${second.id}`)).toHaveLength(1);
  expect(writes(api, "POST", "/mark-triaged")).toHaveLength(2);
});

test("merges a new idea into an existing story after confirming", async ({ page }) => {
  const source = story(1, { status: "submitted", title: "Map of herb spawns", i_want: "a map of herb spawns", area: "map_travel" });
  const target = story(2, { title: "Herb spawn spots on the map", i_want: "herb spawn spots", area: "map_travel", vote_count: 7 });
  const other = story(3, { title: "Raid signups", i_want: "discord raid signups", area: "dungeons_raids" });
  const api = newApi([item(1, source)], [source, target, other]);
  await mockTriage(page, api);
  await signIn(page);

  await card(page, "Map of herb spawns").getByRole("button", { name: "Merge…" }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByRole("heading", { name: "Merge into another story" })).toBeVisible();
  await expect(sheet.getByRole("heading", { name: "Maybe the same as…" })).toBeVisible();
  await sheet.getByLabel("Search stories").fill("raid");
  await expect(sheet.getByRole("button", { name: /Raid signups/ })).toBeVisible();
  await expect(sheet.getByRole("button", { name: /Herb spawn spots/ })).toHaveCount(0);
  await sheet.getByLabel("Search stories").fill("");
  await sheet.getByRole("button", { name: /Herb spawn spots on the map/ }).first().click();

  await expect(sheet.getByTestId("triage-merge-confirm")).toHaveText(
    "Merge into 'Herb spawn spots on the map'? Its 1 vote moves too. This can't be undone.",
  );
  expect(writes(api, "POST", "/merge")).toHaveLength(0);
  await sheet.getByRole("button", { name: "Merge", exact: true }).click();

  await expect(page.getByText("Merged into Herb spawn spots on the map.", { exact: true })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const [merge] = writes(api, "POST", "/merge");
  expect(new URL(merge.url()).pathname).toBe(`/api/wow/feature-requests/triage/stories/${source.id}/merge`);
  expect(merge.postDataJSON()).toEqual({ into_story_id: target.id });
  expect(merge.headers()["if-match"]).toBe(source.updated_at);
  expect(writes(api, "POST", "/mark-triaged")).toHaveLength(1);
  await expect(page.getByTestId("triage-empty-inbox")).toBeVisible();
});

test("All requests: marks an in-progress story shipped, refusing a link off the site", async ({ page }) => {
  const building = story(4, { title: "Cheapest Alchemy route", status: "in_progress", vote_count: 9 });
  const api = newApi([], [story(1), building, story(5, { status: "shipped", shipped_path: "/wow-forever/map" })]);
  await mockTriage(page, api);
  await signIn(page);

  await page.getByRole("tab", { name: "All requests" }).click();
  await expect(page).toHaveURL(/tab=all/);
  await page.getByRole("radio", { name: "In progress" }).click();
  await expect(page).toHaveURL(/status=in_progress/);
  const row = page.locator('[data-section="story-row"]').filter({ hasText: "Cheapest Alchemy route" });
  await row.getByRole("button", { name: /Cheapest Alchemy route/ }).click();
  await row.getByRole("button", { name: "Change status" }).click();
  await expect(row.getByRole("list", { name: "Change status" }).getByRole("button")).toHaveText(["Shipped…", "Planned", "Not planned…"]);
  await row.getByRole("button", { name: "Shipped…" }).click();

  const sheet = page.getByRole("dialog");
  const path = sheet.getByLabel("Page on this site");
  await expect(path).toHaveValue("/wow-forever/");
  await path.fill("https://evil.example/wow-forever");
  await expect(sheet.getByRole("alert")).toHaveText("Use a page on this site, starting with /wow-forever");
  await expect(sheet.getByRole("button", { name: "Mark shipped" })).toBeDisabled();
  await path.fill("/wow-forever/professions?skill=alchemy");
  await expect(sheet.getByRole("button", { name: "Mark shipped" })).toBeEnabled();
  await sheet.getByRole("button", { name: "Mark shipped" }).click();

  await expect(page.getByText("Marked shipped.", { exact: true })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const [patch] = writes(api, "PATCH", `/stories/${building.id}`);
  expect(patch.postDataJSON()).toEqual({ status: "shipped", shipped_path: "/wow-forever/professions?skill=alchemy" });
  expect(patch.headers()["if-match"]).toBe(building.updated_at);
});

test("Sign out drops the session and every private row", async ({ page }) => {
  const s = story(1, { status: "submitted", title: "Secret-ish idea title" });
  const api = newApi([item(1, s)], [s]);
  await mockTriage(page, api);
  await signIn(page);
  await expect(page.getByText("Secret-ish idea title")).toBeVisible();
  for (const r of api.requests) expect(r.headers()["authorization"]).toBe(`Bearer ${FIXTURE_TOKEN}`);

  await workspace(page).getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.getByText("Secret-ish idea title")).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("token"))).toBeNull();

  // Signed out: opening triage again goes to sign in and makes no triage call.
  const before = api.requests.length;
  await page.goto(`${PAGE}?tab=all`);
  await expect(page).toHaveURL(/\/login$/);
  expect(api.requests.length).toBe(before);
});

test("a session that expires mid-way goes to sign in and comes back to the same place", async ({ page }) => {
  const s = story(4, { title: "Cheapest Alchemy route", status: "open" });
  const api = newApi([], [s]);
  await mockTriage(page, api);
  await signIn(page);

  api.expired = true;
  await page.getByRole("tab", { name: "All requests" }).click();
  await fillSignIn(page);
  await expect(page).toHaveURL(/\/wow-forever\/triage\?tab=all/);
  await expect(page.locator('[data-section="story-row"]').filter({ hasText: "Cheapest Alchemy route" })).toBeVisible();
});

test.describe("phone", () => {
  test.use({ viewport: { width: 375, height: 740 }, hasTouch: true });

  test("cards fit the screen with a full-width Approve and 44px targets", async ({ page }) => {
    const long = "W".repeat(400);
    const s = story(1, { status: "submitted", title: "A very long title that should wrap nicely on a small phone screen" });
    const api = newApi([item(1, s, { untrusted_submission_text: long })], [s]);
    await mockTriage(page, api);
    await signIn(page);

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(375);
    const approve = card(page, "A very long title").getByRole("button", { name: "Approve" });
    const box = await approve.boundingBox();
    const cardBox = await card(page, "A very long title").boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    // Full width inside the card's padding.
    expect(box?.width ?? 0).toBeGreaterThan((cardBox?.width ?? 0) - 40);
    for (const name of ["Edit", "Merge…", "More", "Sign out"]) {
      const b = await workspace(page).getByRole("button", { name, exact: true }).first().boundingBox();
      expect(b?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
  });
});

test("the All requests skeleton has the loaded list's structure", async ({ page }) => {
  let release: () => void = () => undefined;
  const stories = [1, 2, 3, 4, 5].map((n) => story(n, { vote_count: n }));
  const api = newApi([], stories);
  api.holdStories = new Promise<void>((resolve) => {
    release = resolve;
  });
  await mockTriage(page, api);
  await signIn(page);
  await page.getByRole("tab", { name: "All requests" }).click();

  const skeleton = page.getByTestId("triage-list-skeleton");
  await expect(skeleton).toBeVisible();
  const shape = async (root: ReturnType<Page["getByTestId"]>) => ({
    sections: await root.locator("[data-section]").evaluateAll((els) => els.map((e) => e.getAttribute("data-section"))),
    rows: await root
      .locator('[data-section="story-row"]')
      .evaluateAll((els) => els.map((e) => [...e.querySelectorAll("[data-row]")].map((r) => r.getAttribute("data-row")).join(","))),
  });
  const loading = await shape(skeleton);
  release();
  const loaded = page.getByTestId("triage-all");
  await expect(loaded.locator('[data-section="story-row"]')).toHaveCount(5);
  expect(await shape(loaded)).toEqual(loading);
});
