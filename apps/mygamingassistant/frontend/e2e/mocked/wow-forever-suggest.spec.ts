/**
 * WoW Forever "Suggest a feature" (/wow-forever/suggest) — the form, every submit outcome, the public board
 * with "Me too", and the footer link on the other WoW pages. The API is mocked; no backend needed. The dev
 * server has no Turnstile site key, so the form sends without the human check.
 *
 * Run: npx playwright test --config=playwright.layout.config.ts wow-forever-suggest
 */
import type { Page, Route } from "@playwright/test";
import { expect, test } from "@platform/ui/test-support/crashGuard";

const LIST_PATH = "/api/wow/feature-requests";
const IDEA = "Show me the cheapest way to level Alchemy from 1 to 300.";

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
  operator_note: string | null;
  shipped_path: string | null;
  vote_count: number;
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
    operator_note: null,
    shipped_path: null,
    vote_count: 10 - n,
    created_at: "2026-11-01T00:00:00Z",
    ...patch,
  };
}

const OPEN = [story(1, { title: "Alchemy leveling route", topic: "alchemy" }), story(2), story(3), story(4)];
const SHIPPED = story(5, { title: "Flight path finder", status: "shipped", shipped_path: "/wow-forever/map", area: "map_travel" });
const NOT_PLANNED = story(6, { title: "Auction house sniper", status: "not_planned", operator_note: "Against the game's rules." });
const ALL = [...OPEN, SHIPPED, NOT_PLANNED];
/** A story merged into OPEN[1]: its detail answers with where it went. */
const MERGED_ID = "77777777-7777-4777-8777-777777777777";

interface Board {
  /** Every list request's query. */
  lists: URLSearchParams[];
  votes: { method: string; id: string }[];
  submits: Record<string, unknown>[];
  voteStatus: number;
  voted: Set<string>;
  /** Set to hold list responses until released. */
  hold: Promise<void> | null;
}

function storiesFor(query: URLSearchParams): Story[] {
  const statuses = query.getAll("status");
  const area = query.get("area");
  return ALL.filter((s) => (statuses.length === 0 || statuses.includes(s.status)) && (area === null || s.area === area));
}

/** Mock the feature-request API (and 404 every other /api call). `onSubmit` answers POSTs. */
async function mockBoard(page: Page, onSubmit: (body: Record<string, unknown>, n: number) => (route: Route) => Promise<void>) {
  const board: Board = { lists: [], votes: [], submits: [], voteStatus: 200, voted: new Set(), hold: null };
  const counts = new Map(ALL.map((s) => [s.id, s.vote_count]));
  await page.route(
    (url) => url.pathname.startsWith("/api/"),
    (route) => route.fulfill({ status: 404, json: { detail: "Not Found" } }),
  );
  await page.route(
    (url) => url.pathname.startsWith(LIST_PATH),
    async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const rest = url.pathname.slice(LIST_PATH.length).split("/").filter(Boolean);
      if (rest.length === 0 && request.method() === "GET") {
        board.lists.push(url.searchParams);
        if (board.hold !== null) await board.hold;
        const items = storiesFor(url.searchParams).map((s) => ({ ...s, vote_count: counts.get(s.id) ?? 0 }));
        return route.fulfill({
          json: { items, next_offset: null, total: items.length, voted_story_ids: [...board.voted] },
        });
      }
      if (rest.length === 0 && request.method() === "POST") {
        const body = request.postDataJSON() as Record<string, unknown>;
        board.submits.push(body);
        return onSubmit(body, board.submits.length)(route);
      }
      if (rest.length === 2 && rest[1] === "vote") {
        const id = rest[0];
        board.votes.push({ method: request.method(), id });
        if (board.voteStatus !== 200) return route.fulfill({ status: board.voteStatus, json: { detail: "boom" } });
        const voted = request.method() === "POST";
        if (voted) board.voted.add(id);
        else board.voted.delete(id);
        counts.set(id, (counts.get(id) ?? 0) + (voted ? 1 : -1));
        return route.fulfill({ json: { story_id: id, voted, vote_count: counts.get(id) } });
      }
      if (rest[0] === MERGED_ID) return route.fulfill({ json: { merged_into_id: OPEN[1].id } });
      const found = ALL.find((s) => s.id === rest[0]);
      return found ? route.fulfill({ json: found }) : route.fulfill({ status: 404, json: { detail: "Not Found" } });
    },
  );
  return board;
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => (route: Route) =>
  route.fulfill({ status, json: body, headers });

const noSubmit = () => json({ detail: "unexpected" }, 500);

async function sendIdea(page: Page, text = IDEA): Promise<void> {
  await page.getByLabel("What would make this app better for you?").fill(text);
  await page.getByRole("button", { name: "Send my idea" }).click();
}

function boardCard(page: Page, title: string) {
  return page.locator("#feature-request-board article").filter({ hasText: title });
}

test("reaches the page from the WoW Forever landing card", async ({ page }) => {
  await mockBoard(page, noSubmit);
  await page.goto("/wow-forever");
  await page.getByRole("link", { name: /^Suggest a feature/ }).first().click();
  await expect(page).toHaveURL(/\/wow-forever\/suggest/);
  await expect(page.getByRole("heading", { level: 1, name: "Suggest a feature" })).toBeVisible();
  await expect(page.getByText("Tell me what's missing. I read every one.")).toBeVisible();
});

test("a new idea shows how it was understood, then waits for review", async ({ page }) => {
  const board = await mockBoard(page, () =>
    json({
      verdict: "new",
      submission_id: "99999999-9999-4999-8999-999999999999",
      story: { ...story(9, { title: "Cheapest Alchemy route" }), status: "submitted" },
    }),
  );
  await page.goto("/wow-forever/suggest");
  await sendIdea(page);
  const heading = page.getByRole("heading", { name: "Here's how I understood it" });
  await expect(heading).toBeVisible();
  await expect(heading).toBeFocused();
  await expect(page.getByText("It goes on the board once I've reviewed it.")).toBeVisible();
  await expect(page.getByText("Criterion for 9")).toBeVisible();
  await expect(page.getByText("Thanks — got your idea.", { exact: true })).toBeVisible();
  expect(board.submits[0]).toMatchObject({ text: IDEA });
  expect(typeof board.submits[0].client_id).toBe("string");

  await page.getByRole("button", { name: "Looks right, thanks" }).click();
  await expect(page.getByLabel("What would make this app better for you?")).toHaveValue("");
  const pending = page.getByRole("region", { name: "Your ideas waiting for review" });
  await expect(pending.getByText("Cheapest Alchemy route")).toBeVisible();
  // Private until reviewed: never on the board.
  await expect(boardCard(page, "Cheapest Alchemy route")).toHaveCount(0);
  await page.reload();
  await expect(pending.getByText("Cheapest Alchemy route")).toBeVisible();
});

test("'That's not what I meant' goes back to the same text", async ({ page }) => {
  await mockBoard(page, () =>
    json({ verdict: "new", submission_id: "99999999-9999-4999-8999-999999999999", story: { ...story(9), status: "submitted" } }),
  );
  await page.goto("/wow-forever/suggest");
  await sendIdea(page);
  await page.getByRole("button", { name: "That's not what I meant" }).click();
  await expect(page.getByText("Add what I got wrong")).toBeVisible();
  await expect(page.getByLabel("What would make this app better for you?")).toHaveValue(IDEA);
});

test("a duplicate counts as a vote and links to the board card", async ({ page }) => {
  await mockBoard(page, () =>
    json({ verdict: "duplicate", story: { ...OPEN[0], vote_count: 10 }, nuance_note: "Also wants herb prices.", voted: true }),
  );
  await page.goto("/wow-forever/suggest");
  await sendIdea(page);
  await expect(page.getByRole("heading", { name: "Someone already asked for this. I added your vote." })).toBeFocused();
  await expect(page.getByText("I also noted: Also wants herb prices.")).toBeVisible();
  await expect(page.getByText("10 players asked").first()).toBeVisible();
  await page.getByRole("button", { name: "View on board" }).click();
  await expect(page).toHaveURL(new RegExp(`r=${OPEN[0].id}`));
  await expect(boardCard(page, "Alchemy leveling route")).toHaveClass(/ring-2/);
});

test("a clarifying question, answered, comes back with a result", async ({ page }) => {
  const board = await mockBoard(page, (_body, n) =>
    n === 1
      ? json({ verdict: "needs_clarification", submission_id: "88888888-8888-4888-8888-888888888888", question: "Which level range?" })
      : json({ verdict: "new", submission_id: "99999999-9999-4999-8999-999999999999", story: { ...story(9), status: "submitted" } }),
  );
  await page.goto("/wow-forever/suggest");
  await sendIdea(page);
  await expect(page.getByRole("heading", { name: "One quick question" })).toBeFocused();
  await expect(page.locator("blockquote")).toHaveText(IDEA);
  await page.getByLabel("Which level range?").fill("150 to 225");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Here's how I understood it" })).toBeVisible();
  expect(board.submits[1]).toMatchObject({
    parent_submission_id: "88888888-8888-4888-8888-888888888888",
    clarification_answer: "150 to 225",
  });
});

test("a rejected idea keeps the text to edit", async ({ page }) => {
  await mockBoard(page, () => json({ verdict: "rejected" }));
  await page.goto("/wow-forever/suggest");
  await sendIdea(page, "Tell me a joke about bananas please");
  await expect(page.getByRole("heading", { name: "Couldn't use that one" })).toBeVisible();
  await page.getByRole("button", { name: "Edit and try again" }).click();
  const box = page.getByLabel("What would make this app better for you?");
  await expect(box).toBeFocused();
  await expect(box).toHaveValue("Tell me a joke about bananas please");
});

test("the rate limit says when to come back and blocks sending", async ({ page }) => {
  await mockBoard(page, () => json({ detail: "Too many requests" }, 429, { "Retry-After": "720" }));
  await page.goto("/wow-forever/suggest");
  await sendIdea(page);
  await expect(page.getByRole("heading", { name: "That's enough for now" })).toBeVisible();
  await expect(page.getByText(/Come back in 12 minutes\./)).toBeVisible();
  await expect(page.getByRole("button", { name: "Send my idea" })).toBeDisabled();
  await expect(page.getByLabel("What would make this app better for you?")).toHaveValue(IDEA);
});

test("paused suggestions keep the draft, and the board still works", async ({ page }) => {
  await mockBoard(page, () => json({ detail: "feature_requests_unavailable" }, 503));
  await page.goto("/wow-forever/suggest");
  await sendIdea(page);
  await expect(page.getByText(/Suggestions are paused right now/)).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("What would make this app better for you?")).toHaveValue(IDEA);
  await expect(boardCard(page, "Alchemy leveling route")).toBeVisible();
});

test("a lost connection offers Retry", async ({ page }) => {
  let n = 0;
  await mockBoard(page, () => {
    n += 1;
    if (n === 1) return (route) => route.abort("internetdisconnected");
    return json({ verdict: "rejected" });
  });
  await page.goto("/wow-forever/suggest");
  await sendIdea(page);
  await expect(page.getByRole("heading", { name: "Couldn't reach the server" })).toBeVisible();
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByRole("heading", { name: "Couldn't use that one" })).toBeVisible();
});

test("Me too toggles, and takes the vote back", async ({ page }) => {
  const board = await mockBoard(page, noSubmit);
  await page.goto("/wow-forever/suggest");
  const card = boardCard(page, "Alchemy leveling route");
  const meToo = card.getByRole("button", { name: /^Me too/ });
  await expect(card.getByText("9 players asked")).toBeVisible();
  await meToo.click();
  await expect(meToo).toHaveAttribute("aria-pressed", "true");
  await expect(card.getByText("10 players asked")).toBeVisible();
  await meToo.click();
  await expect(meToo).toHaveAttribute("aria-pressed", "false");
  await expect(card.getByText("9 players asked")).toBeVisible();
  expect(board.votes.map((v) => v.method)).toEqual(["POST", "DELETE"]);
  // Shipped and not-planned cards show the count only.
  await page.getByRole("radio", { name: "All" }).click();
  await expect(boardCard(page, "Flight path finder").getByRole("button", { name: /^Me too/ })).toHaveCount(0);
});

test("a vote that fails rolls back with a message", async ({ page }) => {
  const board = await mockBoard(page, noSubmit);
  board.voteStatus = 500;
  await page.goto("/wow-forever/suggest");
  const card = boardCard(page, "Alchemy leveling route");
  const meToo = card.getByRole("button", { name: /^Me too/ });
  await meToo.click();
  await expect(page.getByText("Couldn't save your vote. Try again.", { exact: true })).toBeVisible();
  await expect(meToo).toHaveAttribute("aria-pressed", "false");
  await expect(card.getByText("9 players asked")).toBeVisible();
});

test("filters live in the URL", async ({ page }) => {
  const board = await mockBoard(page, noSubmit);
  await page.goto("/wow-forever/suggest?status=shipped&area=map_travel");
  await expect(page.getByRole("radio", { name: "Shipped" })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByLabel("Area")).toHaveValue("map_travel");
  const shipped = boardCard(page, "Flight path finder");
  await expect(shipped.getByRole("link", { name: "Shipped — try it →" })).toHaveAttribute("href", "/wow-forever/map");
  const last = board.lists[board.lists.length - 1];
  expect(last.getAll("status")).toEqual(["shipped"]);
  expect(last.get("area")).toBe("map_travel");

  await page.getByRole("radio", { name: "Not planned" }).click();
  await expect(page).toHaveURL(/status=not_planned/);
  await expect(page.getByText("No requests match these filters.")).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page).toHaveURL(/\/wow-forever\/suggest$/);
  await expect(boardCard(page, "Alchemy leveling route")).toBeVisible();

  await page.getByRole("radio", { name: "Not planned" }).click();
  await expect(page).toHaveURL(/status=not_planned/);
  await page.getByLabel("Area").selectOption("");
  await page.getByRole("radio", { name: "Newest" }).click();
  await expect(page).toHaveURL(/sort=new/);
  await expect(boardCard(page, "Auction house sniper").getByText("Why not: Against the game's rules.")).toBeVisible();
});

test("a shared link to a story outside the filters pins it, and a merged one follows on", async ({ page }) => {
  await mockBoard(page, noSubmit);
  await page.goto(`/wow-forever/suggest?status=shipped&r=${OPEN[0].id}`);
  const pinned = boardCard(page, "Alchemy leveling route");
  await expect(pinned).toBeVisible();
  await expect(pinned).toHaveClass(/ring-2/);
  await expect(boardCard(page, "Flight path finder")).toBeVisible();

  await page.goto("/wow-forever/gold");
  await page.goto(`/wow-forever/suggest?r=${MERGED_ID}`);
  await expect(page).toHaveURL(new RegExp(`r=${OPEN[1].id}`));
  await expect(boardCard(page, "Idea number 2")).toHaveClass(/ring-2/);
  // Following the merge replaced the history entry: Back leaves the page instead of bouncing.
  await page.goBack();
  await expect(page).toHaveURL(/\/wow-forever\/gold$/);
});

test("the skeleton has the loaded board's structure", async ({ page }) => {
  const board = await mockBoard(page, noSubmit);
  let release = () => {};
  board.hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.goto("/wow-forever/suggest");
  const skeleton = page.getByTestId("feature-request-skeleton");
  await expect(skeleton).toBeVisible();
  // The form works while the board loads.
  await expect(page.getByLabel("What would make this app better for you?")).toBeEditable();
  const shape = (root: string) =>
    page.evaluate((selector) => {
      const el = document.querySelector(selector);
      if (el === null) return null;
      const sections = Array.from(el.querySelectorAll("[data-section]")).map((s) => s.getAttribute("data-section"));
      const cards = Array.from(el.querySelectorAll("[data-section='card']")).map((c) =>
        Array.from(c.querySelectorAll("[data-row]")).map((r) => r.getAttribute("data-row")),
      );
      return { sections, cards };
    }, root);
  const loading = await shape("[data-testid='feature-request-skeleton']");
  release();
  await expect(skeleton).toHaveCount(0);
  await expect(boardCard(page, "Alchemy leveling route")).toBeVisible();
  const loaded = await shape("#feature-request-board");
  expect(loaded).toEqual(loading);
});

test("the phone layout: no sideways scroll, a full-width send button and 44px targets", async ({ page }) => {
  await mockBoard(page, noSubmit);
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/wow-forever/suggest");
  await expect(boardCard(page, "Alchemy leveling route")).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  const box = await page.getByLabel("What would make this app better for you?").boundingBox();
  const send = await page.getByRole("button", { name: "Send my idea" }).boundingBox();
  expect(send?.width).toBeCloseTo(box?.width ?? 0, 0);
  const meToo = await boardCard(page, "Alchemy leveling route").getByRole("button", { name: /^Me too/ }).boundingBox();
  expect(meToo?.height).toBeGreaterThanOrEqual(44);
  // The idea box is the page's first control after the back link.
  const firstControls = await page.evaluate(() =>
    Array.from(document.querySelectorAll("main a[href], main button, main textarea, main select"))
      .slice(0, 2)
      .map((el) => el.tagName.toLowerCase()),
  );
  expect(firstControls).toEqual(["a", "textarea"]);
});

test("the desktop layout keeps the send button its own size", async ({ page }) => {
  await mockBoard(page, noSubmit);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/wow-forever/suggest");
  await expect(boardCard(page, "Alchemy leveling route")).toBeVisible();
  const box = await page.getByLabel("What would make this app better for you?").boundingBox();
  const send = await page.getByRole("button", { name: "Send my idea" }).boundingBox();
  expect(send?.width ?? 0).toBeLessThan((box?.width ?? 0) / 2);
});

test("every other WoW Forever page links here with its area", async ({ page }) => {
  await mockBoard(page, noSubmit);
  const pages: [string, string][] = [
    ["/wow-forever", "/wow-forever/suggest"],
    ["/wow-forever/gold", "/wow-forever/suggest?area=gold_economy"],
    ["/wow-forever/professions", "/wow-forever/suggest?area=professions"],
    ["/wow-forever/macros", "/wow-forever/suggest?area=class_guides"],
  ];
  for (const [path, href] of pages) {
    await page.goto(path);
    const link = page.getByRole("link", { name: "Missing something? Suggest a feature" });
    await expect(link).toHaveAttribute("href", href);
  }
  await page.getByRole("link", { name: "Missing something? Suggest a feature" }).click();
  await expect(page).toHaveURL(/\/wow-forever\/suggest\?area=class_guides$/);
  await expect(page.getByLabel("Area")).toHaveValue("class_guides");
  await expect(page.getByRole("link", { name: "Missing something? Suggest a feature" })).toHaveCount(0);
});
