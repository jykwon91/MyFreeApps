/**
 * WoW Forever "Ask" (/wow-forever/ask) — a question goes to the relay, the
 * browser runs Claude's tool call against the site's own map data, the card
 * lists the real nearest trainers, and "Route there" opens the World Map with
 * directions. The guide tools (rares, professions) answer from the site's own
 * data too, and the live tools from the site's own prices and server status
 * (both mocked here, including when they're old or fail). Also: the hub's ask box, the rate-limit and daily-cap notices,
 * Cancel, the phone layout and the loading skeleton.
 *
 * The relay (`POST /api/wow/chat/turn`) is mocked; every other /api call
 * answers 404. The dev server has no Turnstile site key, so questions go
 * without the human check.
 *
 * Run: npx playwright test --config e2e/playwright.config.ts wow-forever-ask
 */
import { expect, test, type Page, type Route } from "@playwright/test";

const TURN_PATH = "/api/wow/chat/turn";
const QUESTION = "where's the closest warlock trainer if i'm in desolace";
const TICKET = "fixture-ticket.fixture-signature";
const ANSWER = "The nearest warlock trainers for the Alliance are in Stormwind City and Ironforge.";

interface TurnBody {
  messages: { role: string; content: { type: string; text?: string; tool_use_id?: string; content?: string }[] }[];
  ticket?: string;
}

interface Relay {
  bodies: TurnBody[];
  headers: Record<string, string>[];
}

type Reply = (body: TurnBody, n: number) => (route: Route) => Promise<void>;

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => (route: Route) =>
  route.fulfill({ status, json: body, headers });

function toolUse(
  name = "search_npcs",
  input: Record<string, unknown> = { query: "warlock trainer", from_zone: "Desolace" },
) {
  return json({
    message: {
      role: "assistant",
      content: [
        { type: "text", text: "Let me look that up." },
        { type: "tool_use", id: "toolu_fixture_1", name, input },
      ],
    },
    stop_reason: "tool_use",
    ticket: TICKET,
    rounds_left: 3,
  });
}

function answer(text = ANSWER) {
  return json({
    message: { role: "assistant", content: [{ type: "text", text }] },
    stop_reason: "end_turn",
    ticket: TICKET,
    rounds_left: 2,
  });
}

/** The tool call, then the answer once the result comes back. */
const trainerFlow: Reply = (body) => (body.ticket ? answer() : toolUse());

async function mockRelay(page: Page, reply: Reply): Promise<Relay> {
  const relay: Relay = { bodies: [], headers: [] };
  await page.route(
    (url) => url.pathname.startsWith("/api/"),
    (route) => route.fulfill({ status: 404, json: { detail: "Not Found" } }),
  );
  await page.route("**/api/wow/map-captures", (route) => route.fulfill({ json: { captures: [] } }));
  await page.route(
    (url) => url.pathname === TURN_PATH,
    async (route) => {
      const body = route.request().postDataJSON() as TurnBody;
      relay.bodies.push(body);
      relay.headers.push(route.request().headers());
      return reply(body, relay.bodies.length)(route);
    },
  );
  return relay;
}

async function ask(page: Page, text = QUESTION): Promise<void> {
  await page.getByLabel("Your question").fill(text);
  await page.getByRole("button", { name: "Send", exact: true }).click();
}

test("ask → the tool runs on real data → pick a trainer → Route there → World Map directions", async ({ page }) => {
  const relay = await mockRelay(page, trainerFlow);
  await page.goto("/wow-forever/ask");
  await expect(page.getByRole("heading", { level: 1, name: "Ask" })).toBeVisible();
  await expect(page).toHaveTitle("Ask · WoW Forever");
  await expect(page.getByRole("heading", { name: "What do you want to find?" })).toBeVisible();

  await ask(page);
  const card = page.getByRole("region", { name: "warlock trainer" });
  await expect(card).toBeVisible();
  await expect(page.getByTestId("ask-answer")).toContainText(ANSWER);
  await expect(card.getByText("Nearest to Desolace")).toBeVisible();
  // Trainers standing together are one "×N" pin, so a pin is either kind.
  await expect(card.locator("[data-testid=ask-map-marker], [data-testid=ask-map-cluster]").first()).toBeVisible();
  // The step lines go once the answer is in.
  await expect(page.getByText("Searching the map for “warlock trainer”…")).toHaveCount(0);

  // The relay saw: the question (new, no ticket), then the tool result with the ticket.
  expect(relay.bodies).toHaveLength(2);
  expect(relay.bodies[0].ticket).toBeUndefined();
  expect(relay.bodies[0].messages).toEqual([{ role: "user", content: [{ type: "text", text: QUESTION }] }]);
  expect(relay.bodies[1].ticket).toBe(TICKET);
  const result = relay.bodies[1].messages.at(-1)!.content[0];
  expect(result.type).toBe("tool_result");
  expect(result.tool_use_id).toBe("toolu_fixture_1");
  const sent = JSON.parse(result.content ?? "{}") as { from: { place: string }; results: { name: string; title: string }[] };
  expect(sent.from.place).toBe("Desolace");
  expect(sent.results.length).toBeGreaterThan(0);
  expect(sent.results.every((r) => r.title === "Warlock Trainer")).toBe(true);

  // The card's rows are those same real trainers.
  const rows = card.locator("ol > li");
  await expect(rows).toHaveCount(sent.results.length);
  // Distances are the planned route's trip time, in the order the rows are listed.
  await expect(rows.first()).toContainText(/about \d+ min, ~[\d,]+ yd/);
  await expect(card.getByRole("link", { name: "Route there" })).toHaveCount(0);
  const first = sent.results[0].name;
  await card.getByRole("button", { name: new RegExp(first) }).click();
  // The picked row's own pin stands out, even out of a crowd.
  await expect(card.locator("[data-testid=ask-map-marker].bg-red-600")).toHaveText("1");
  const route = card.getByRole("link", { name: "Route there" });
  const href = await route.getAttribute("href");
  expect(href).toMatch(/^\/wow-forever\/map\?faction=[AH]&to=npc%3A[^&]+&from=pt%3A1443%2C50\.0%2C50\.0&dir=1$/);

  await route.click();
  await expect(page).toHaveURL(/\/wow-forever\/map\?faction=[AH]&to=npc/);
  const planner = page.getByRole("region", { name: "Route planner" });
  await expect(planner.getByRole("list", { name: "Directions" })).toBeVisible({ timeout: 20_000 });
  await expect(planner).toContainText(first);

  // Back returns to the chat, which kept the conversation.
  await page.goBack();
  await expect(page.getByTestId("ask-answer")).toContainText(ANSWER);
});

test("a Horde search's Route there plans as Horde on the map, without changing the saved faction", async ({ page }) => {
  await mockRelay(page, (body) => (body.ticket ? answer() : toolUse("search_npcs", { query: "warlock trainer", from_zone: "Desolace", faction: "horde" })));
  await page.goto("/wow-forever/ask");
  await ask(page);
  const card = page.getByRole("region", { name: "warlock trainer" });
  await expect(card).toBeVisible();
  await card.locator("ol > li button").first().click();
  const route = card.getByRole("link", { name: "Route there" });
  expect(await route.getAttribute("href")).toMatch(/^\/wow-forever\/map\?faction=H&to=/);

  await route.click();
  await expect(page).toHaveURL(/faction=H/);
  const planner = page.getByRole("region", { name: "Route planner" });
  await expect(planner.getByRole("list", { name: "Directions" })).toBeVisible({ timeout: 20_000 });
  // Planned as Horde for this visit only: the saved faction is untouched.
  const saved = await page.evaluate(() => window.localStorage.getItem("mga.wowForever.worldMap.player.v1"));
  expect(saved === null || !saved.includes('"faction":"H"')).toBe(true);
});

function sentResult<T>(relay: Relay): T {
  const result = relay.bodies[1].messages.at(-1)!.content[0];
  expect(result.type).toBe("tool_result");
  return JSON.parse(result.content ?? "{}") as T;
}

test("rares near a level-30 player in Ashenvale → pick one → Route there → World Map directions", async ({ page }) => {
  const relay = await mockRelay(page, (body) =>
    body.ticket ? answer("Prince Raze and a few others fit level 30.") : toolUse("find_rares", { level: 30, zone: "Ashenvale" }),
  );
  await page.goto("/wow-forever/ask");
  await ask(page, "any rares worth killing at level 30 in ashenvale");
  const card = page.getByRole("region", { name: "Rares for level 30" });
  await expect(card).toBeVisible();
  await expect(card.getByText(/Near Ashenvale/)).toBeVisible();

  const sent = sentResult<{ level: number; in_zone: number; results: { name: string }[] }>(relay);
  expect(sent.level).toBe(30);
  expect(sent.in_zone).toBeGreaterThan(0);
  await expect(card.locator("ol > li")).toHaveCount(sent.results.length);
  await expect(card.getByRole("link", { name: "Open the Rares list" })).toHaveAttribute(
    "href",
    /^\/wow-forever\/rares\?zone=\d+&min=27&max=32$/,
  );

  const first = sent.results[0].name;
  await card.getByRole("button", { name: new RegExp(first) }).click();
  await expect(card.getByRole("link", { name: "Show on the World Map" })).toBeVisible();
  const route = card.getByRole("link", { name: "Route there" });
  expect(await route.getAttribute("href")).toMatch(/^\/wow-forever\/map\?to=pt%3A\d+%2C[^&]+&from=pt%3A[^&]+&dir=1$/);
  await route.click();
  await expect(page).toHaveURL(/\/wow-forever\/map\?to=pt/);
  const planner = page.getByRole("region", { name: "Route planner" });
  await expect(planner.getByRole("list", { name: "Directions" })).toBeVisible({ timeout: 20_000 });

  await page.goBack();
  await expect(page.getByRole("region", { name: "Rares for level 30" })).toBeVisible();
});

test("how to level Tailoring from 150 → the guide's next steps, with the guide offered, not opened", async ({ page }) => {
  const relay = await mockRelay(page, (body) =>
    body.ticket ? answer("From 150, follow the steps below.") : toolUse("profession_guide", { profession: "tailoring", skill: 150 }),
  );
  await page.goto("/wow-forever/ask");
  await ask(page, "how do I level tailoring from 150");
  const card = page.getByRole("region", { name: "Tailoring from skill 150" });
  await expect(card).toBeVisible();
  await expect(page.getByTestId("ask-answer")).toContainText("From 150, follow the steps below.");
  await expect(page).toHaveURL(/\/wow-forever\/ask$/);

  const sent = sentResult<{ profession: string; from_skill: number }>(relay);
  expect(sent).toMatchObject({ profession: "Tailoring", from_skill: 150 });
  await expect(card.locator("ol > li").first()).toContainText(/^150–\d+/);
  await expect(card.getByText(/^Materials: /).first()).toBeVisible();
  const open = card.getByRole("link", { name: "Open the Tailoring guide" });
  await expect(open).toHaveAttribute("href", "/wow-forever/professions?p=tailoring&skill=150");
  await open.click();
  await expect(page).toHaveURL(/\/wow-forever\/professions\?p=tailoring&skill=150/);
});

const HOUR_MS = 3_600_000;

function priceResponse(hoursOld: number, faction = "alliance") {
  return {
    region: "us",
    server: "pvp",
    faction,
    source_updated_at: new Date(Date.now() - hoursOld * HOUR_MS).toISOString(),
    fetched_at: new Date().toISOString(),
    columns: ["item_id", "market_value", "min_buyout", "quantity", "listings", "name"],
    items: [
      [2589, 1234, 1100, 20239, 910, "Linen Cloth"],
      [2996, 5000, 4800, 812, 60, "Bolt of Linen Cloth"],
    ],
  };
}

/** Prices for whichever house is asked for, `hoursOld` old; records each "server/faction" asked. */
async function servePrices(page: Page, hoursOld: number, asked: string[] = []) {
  await page.route(
    (url) => url.pathname === "/api/wow/prices",
    (route) => {
      const faction = new URL(route.request().url()).searchParams.get("faction") ?? "alliance";
      asked.push(`${new URL(route.request().url()).searchParams.get("server")}/${faction}`);
      return route.fulfill({ json: priceResponse(hoursOld, faction) });
    },
  );
}

interface SentPrices {
  region: string;
  auction_house: string;
  updated: string;
  note: string | null;
  results: { name: string; market_value: string; cheapest: string; on_sale: number }[];
}

test("how much is Linen Cloth → your faction's auction price, credited, with the Auction house offered", async ({ page }) => {
  const relay = await mockRelay(page, (body) =>
    body.ticket ? answer("Linen Cloth sells for 12s 34c.") : toolUse("auction_prices", { query: "Linen Cloth" }),
  );
  const asked: string[] = [];
  await servePrices(page, 2, asked);
  await page.goto("/wow-forever/ask");
  await ask(page, "how much is linen cloth selling for");
  const card = page.getByRole("region", { name: "Auction prices · PvP · Alliance AH" });
  await expect(card).toBeVisible();
  await expect(page.getByTestId("ask-answer")).toContainText("Linen Cloth sells for 12s 34c.");
  expect(asked).toEqual(["pvp/alliance"]);

  const sent = sentResult<SentPrices>(relay);
  expect(sent).toMatchObject({ region: "US", auction_house: "PvP · Alliance", updated: "2 hours ago", note: null });
  expect(sent.results[0]).toEqual({ name: "Linen Cloth", market_value: "12s 34c", cheapest: "11s", on_sale: 20239 });

  const rows = card.locator("ul > li");
  await expect(rows.first()).toContainText("Linen Cloth");
  await expect(rows.first()).toContainText("12s 34c");
  await expect(rows.first()).toContainText("On sale: 20,239 in 910 auctions");
  await expect(card.getByTestId("price-credit")).toContainText("Prices from Blizzard (PvP · Alliance AH, US) · updated 2 hours ago");
  await expect(card.getByText(/may be out of date/)).toHaveCount(0);
  const open = card.getByRole("link", { name: "Open the Auction house" });
  await expect(open).toHaveAttribute("href", "/wow-forever/auction-house?q=Linen+Cloth&house=alliance");
  await open.click();
  await expect(page).toHaveURL(/\/wow-forever\/auction-house\?q=Linen\+Cloth/);
  await expect(page.getByRole("radio", { name: "Alliance" })).toHaveAttribute("aria-checked", "true");
});

test("asking for the Horde price checks the Horde houses, and the link opens them", async ({ page }) => {
  const relay = await mockRelay(page, (body) =>
    body.ticket ? answer("On the Horde side it's 12s 34c.") : toolUse("auction_prices", { query: "Linen Cloth", faction: "horde" }),
  );
  const asked: string[] = [];
  await servePrices(page, 1, asked);
  await page.goto("/wow-forever/ask");
  await ask(page, "linen cloth price on horde");
  const card = page.getByRole("region", { name: "Auction prices · PvP · Horde AH" });
  await expect(card.getByTestId("price-credit")).toContainText("(PvP · Horde AH, US)");
  expect(asked).toEqual(["pvp/horde"]);
  expect(sentResult<SentPrices>(relay).auction_house).toBe("PvP · Horde");
  await card.getByRole("link", { name: "Open the Auction house" }).click();
  await expect(page).toHaveURL(/house=horde/);
  await expect(page.getByRole("radio", { name: "Horde" })).toHaveAttribute("aria-checked", "true");
});

test("old prices are flagged, and prices that don't load are never guessed", async ({ page }) => {
  let pricesUp = true;
  const relay = await mockRelay(page, (body) =>
    body.ticket ? answer("Here's what I found.") : toolUse("auction_prices", { query: "Linen Cloth" }),
  );
  await page.route(
    (url) => url.pathname === "/api/wow/prices",
    (route) => (pricesUp ? route.fulfill({ json: priceResponse(30) }) : route.fulfill({ status: 503, json: { detail: "down" } })),
  );
  await page.goto("/wow-forever/ask");
  await ask(page, "linen cloth price");
  const card = page.getByRole("region", { name: "Auction prices · PvP · Alliance AH" });
  await expect(card.getByTestId("price-credit")).toContainText("these may be out of date");
  expect(sentResult<{ note: string }>(relay).note).toMatch(/more than 12 hours old/);

  // A fresh chat, with the prices failing: the card says so, no figures, and Claude gets an error.
  pricesUp = false;
  await page.getByRole("button", { name: "New chat" }).click();
  await page.reload();
  const before = relay.bodies.length;
  await ask(page, "linen cloth price");
  await expect(page.getByText("Couldn't load the auction prices. Ask again in a moment.")).toBeVisible();
  const failedCard = page.getByRole("region", { name: "Auction prices · PvP · Alliance AH" });
  await expect(failedCard.getByTestId("price-credit")).toHaveCount(0);
  await expect(failedCard.locator("ul > li")).toHaveCount(0);
  const result = relay.bodies[before + 1].messages.at(-1)!.content[0] as { is_error?: boolean; content?: string };
  expect(result.is_error).toBe(true);
  expect(result.content).toContain("don't guess a price");
});

test("is the server up → each ruleset; Blizzard unreachable is never called down", async ({ page }) => {
  let blizzardUp = true;
  const relay = await mockRelay(page, (body) => (body.ticket ? answer("Checked.") : toolUse("server_status", {})));
  await page.route(
    (url) => url.pathname === "/api/wow/server-status",
    (route) =>
      blizzardUp
        ? route.fulfill({
            json: {
              region: "us",
              checked_at: new Date().toISOString(),
              rulesets: [
                { name: "Normal", slug: "normal", online: true },
                { name: "PvP", slug: "pvp", online: false },
              ],
            },
          })
        : route.fulfill({ status: 502, json: { detail: "Could not reach Blizzard's server status service." } }),
  );
  await page.goto("/wow-forever/ask");
  await ask(page, "is the server up");
  const card = page.getByRole("region", { name: "Server status · Americas" });
  await expect(card.getByText("1 of 2 servers offline")).toBeVisible();
  await expect(card.getByRole("list", { name: "Server rulesets" }).locator("li")).toHaveCount(2);
  await expect(card.getByText(/^Checked /)).toBeVisible();
  await expect(card.getByRole("link", { name: "Open Server status" })).toHaveAttribute("href", "/wow-forever/server-status");
  expect(sentResult<{ rulesets: { name: string; up: boolean }[] }>(relay).rulesets).toEqual([
    { name: "Normal", up: true },
    { name: "PvP", up: false },
  ]);

  blizzardUp = false;
  await page.getByRole("button", { name: "New chat" }).click();
  await page.reload();
  const before = relay.bodies.length;
  await ask(page, "is the server up");
  const down = page.getByRole("region", { name: "Server status · Americas" });
  await expect(down.getByText("Couldn't reach Blizzard's status page — the servers may still be up.")).toBeVisible();
  await expect(down.getByText(/servers (online|offline)/)).toHaveCount(0);
  const result = relay.bodies[before + 1].messages.at(-1)!.content[0] as { is_error?: boolean; content?: string };
  expect(result.is_error).toBe(true);
  expect(result.content).toContain("don't say the servers are up or down");
});

test("the hub's ask box opens the page and sends the question once", async ({ page }) => {
  const relay = await mockRelay(page, () => answer("Hello there."));
  await page.goto("/wow-forever");
  const box = page.getByRole("search", { name: "Ask about WoW: Forever" });
  await box.getByRole("textbox").fill("Where is Booty Bay?");
  await box.getByRole("button", { name: "Ask" }).click();
  await expect(page).toHaveURL(/\/wow-forever\/ask$/);
  await expect(page.getByTestId("ask-answer")).toContainText("Hello there.");
  await page.reload();
  await expect(page.getByTestId("ask-answer")).toContainText("Hello there.");
  expect(relay.bodies).toHaveLength(1);
  expect(relay.bodies[0].messages[0].content[0].text).toBe("Where is Booty Bay?");
});

test("the rate limit counts down before Try again works", async ({ page }) => {
  await mockRelay(page, (_body, n) =>
    n === 1 ? json({ detail: "Too many requests" }, 429, { "Retry-After": "2" }) : answer("Here you go."),
  );
  await page.goto("/wow-forever/ask");
  await ask(page, "Where is Booty Bay?");
  const notice = page.getByTestId("ask-error");
  await expect(notice).toContainText("You're asking a lot right now.");
  await expect(notice.getByRole("button", { name: /Try again in \d s/ })).toBeDisabled();
  await notice.getByRole("button", { name: "Try again", exact: true }).click({ timeout: 5_000 });
  await expect(page.getByTestId("ask-answer")).toContainText("Here you go.");
  await expect(notice).toHaveCount(0);
});

test("the daily cap says so, with nothing to retry", async ({ page }) => {
  await mockRelay(page, () => json({ detail: "chat_daily_limit_reached" }, 429, { "Retry-After": "3600" }));
  await page.goto("/wow-forever/ask");
  await ask(page, "Where is Booty Bay?");
  const notice = page.getByTestId("ask-error");
  await expect(notice).toContainText("Ask has answered all it can for today.");
  await expect(notice.getByRole("button")).toHaveCount(0);
  await expect(page.getByTestId("ask-answer")).toHaveCount(0);
});

test("a follow-up question keeps the chat going, also after a trip to the World Map", async ({ page }) => {
  // Like the real relay: a question with history but no ticket is refused.
  const relay = await mockRelay(page, (body) => {
    if (body.messages.length > 1 && body.ticket !== TICKET) return json({ detail: "chat_ticket_required" }, 400);
    return answer(`Answer ${Math.ceil(body.messages.length / 2)}.`);
  });
  await page.goto("/wow-forever/ask");
  await ask(page, "Where is Booty Bay?");
  await expect(page.getByTestId("ask-answer")).toContainText("Answer 1.");
  await ask(page, "And Gadgetzan?");
  await expect(page.getByTestId("ask-answer").nth(1)).toContainText("Answer 2.");

  await page.goto("/wow-forever/map");
  await page.goto("/wow-forever/ask");
  await ask(page, "And Ratchet?");
  await expect(page.getByTestId("ask-answer").nth(2)).toContainText("Answer 3.");
  await expect(page.getByTestId("ask-error")).toHaveCount(0);
  expect(relay.bodies.map((b) => b.ticket)).toEqual([undefined, TICKET, TICKET]);
});

test("an expired chat offers New chat", async ({ page }) => {
  await mockRelay(page, (body) => (body.messages.length > 2 ? json({ detail: "chat_ticket_expired" }, 409) : answer("First answer.")));
  await page.goto("/wow-forever/ask");
  await ask(page, "Where is Booty Bay?");
  await expect(page.getByTestId("ask-answer")).toContainText("First answer.");
  await ask(page, "And Gadgetzan?");
  const notice = page.getByTestId("ask-error");
  await expect(notice).toContainText("This chat has expired.");
  await notice.getByRole("button", { name: "New chat" }).click();
  await expect(page.getByRole("heading", { name: "What do you want to find?" })).toBeVisible();
  await expect(page.getByRole("status").getByText("Chat cleared.")).toBeVisible();
});

test("Cancel stops the answer and puts the question back", async ({ page }) => {
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await mockRelay(page, () => async (route) => {
    await held;
    await route.fulfill({ status: 500, json: {} }).catch(() => undefined);
  });
  await page.goto("/wow-forever/ask");
  await ask(page, "Where is Booty Bay?");
  const steps = page.getByTestId("ask-steps");
  await expect(steps).toContainText("Thinking…");
  await expect(page.getByRole("button", { name: "Sending…" })).toBeDisabled();
  await steps.getByRole("button", { name: "Cancel" }).click();
  await expect(steps).toHaveCount(0);
  await expect(page.getByLabel("Your question")).toHaveValue("Where is Booty Bay?");
  await expect(page.getByTestId("ask-error")).toHaveCount(0);
  release();
});

test("the skeleton has the loaded page's structure", async ({ page }) => {
  await mockRelay(page, trainerFlow);
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(/data\/worldMap\/.*\.json/, async (route) => {
    await held;
    await route.continue();
  });
  await page.goto("/wow-forever/ask");
  const skeleton = page.getByTestId("ask-skeleton");
  await expect(skeleton).toBeVisible();
  const sections = (root: string) =>
    page.evaluate(
      (selector) =>
        Array.from(document.querySelectorAll(`${selector} [data-section]`)).map((el) => el.getAttribute("data-section")),
      root,
    );
  const loading = await sections("[data-testid='ask-skeleton']");
  release();
  await expect(skeleton).toHaveCount(0);
  await expect(page.getByLabel("Your question")).toBeVisible();
  expect(await sections("[data-testid='ask-chat']")).toEqual(loading);
});

test("the phone layout: no sideways scroll, 44px targets, the card fits", async ({ page }) => {
  await mockRelay(page, trainerFlow);
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/wow-forever/ask");
  await ask(page);
  const card = page.getByRole("region", { name: "warlock trainer" });
  await expect(card).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  const row = await card.getByRole("listitem").first().getByRole("button").first().boundingBox();
  expect(row?.height ?? 0).toBeGreaterThanOrEqual(44);
  const send = await page.getByRole("button", { name: "Send", exact: true }).boundingBox();
  expect(send?.height ?? 0).toBeGreaterThanOrEqual(44);
  const cardBox = await card.boundingBox();
  expect((cardBox?.x ?? 0) + (cardBox?.width ?? 0)).toBeLessThanOrEqual(375);
});
