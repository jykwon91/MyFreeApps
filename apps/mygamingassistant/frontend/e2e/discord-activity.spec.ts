/**
 * MGA as a Discord Activity, end to end — no Discord and no backend needed.
 *
 * Discord launches an Activity by iframing the site with launch parameters
 * (?frame_id=…&instance_id=…&platform=…) and talks to it over postMessage (the
 * Embedded App SDK's RPC). Here a same-origin host page plays Discord's client:
 * it iframes the app the way Discord does, answers the SDK's handshake with
 * READY (when the test says so) or closes the connection, and answers and
 * records the commands the app sends. The API is mocked.
 *
 * Run: npm run test:e2e -- discord-activity
 */
import { expect, test, type Page } from "@playwright/test";

const CLIENT_ID = "1555249458542022666";
const SITE_URL = "https://mygamingassistant.myfreeapps.org";
const HOST_PATH = "/__discord-activity-host";
const LAUNCH_QUERY = "?frame_id=frame-e2e&instance_id=instance-e2e&platform=desktop";
// A string only the Embedded App SDK contains: how its chunk is recognised.
const SDK_MARKER = "OPEN_EXTERNAL_LINK";

const GAMES = [
  { id: "g-cs2", slug: "cs2", name: "Counter-Strike 2", kind: "lineups", side_a_label: "T", side_b_label: "CT" },
  { id: "g-wow", slug: "wow-forever", name: "WoW: Forever", kind: "companion", side_a_label: null, side_b_label: null },
];
// A presigned R2 URL, as the API hands out media in production.
const R2_PATH = "/mga-media/minimaps/mirage.webp?X-Amz-Signature=0f1e2d";
const MINIMAP_URL = `https://0a1b2c3d.r2.cloudflarestorage.com${R2_PATH}`;
const MAPS = [{ id: "m-mirage", slug: "mirage", name: "Mirage", minimap_url: MINIMAP_URL }];
const PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

// Discord's answers to the SDK's handshake.
const READY = [
  1,
  {
    cmd: "DISPATCH",
    evt: "READY",
    nonce: null,
    data: { v: 1, config: { api_endpoint: "//discord.com/api", environment: "production" } },
  },
];
const CLOSE = [2, { code: 4000, message: "Invalid Client ID" }];

/** "manual": wait for the test to send READY. "close": refuse the connection. */
type HostMode = "manual" | "close";

interface RpcLog {
  handshakes: { client_id?: string; frame_id?: string }[];
  commands: { cmd: string; args?: { url?: string } }[];
}

function hostPage(mode: HostMode): string {
  // Only OPEN_EXTERNAL_LINK is answered. Other commands (CAPTURE_LOG, sent for
  // every console call once connected) stay pending, which the SDK tolerates;
  // a malformed answer would make it log, and so send CAPTURE_LOG, forever.
  return `<!doctype html>
<html>
<head><meta charset="utf-8"><title>Discord (test host)</title></head>
<body style="margin:0">
<script>
  window.__rpc = { handshakes: [], commands: [] };
  window.__sendReady = () => document.getElementById("activity").contentWindow.postMessage(${JSON.stringify(READY)}, "*");
  window.addEventListener("message", (event) => {
    const activity = document.getElementById("activity");
    if (!activity || event.source !== activity.contentWindow || !Array.isArray(event.data)) return;
    const [opcode, payload] = event.data;
    if (opcode === 0) {
      window.__rpc.handshakes.push(payload);
      ${mode === "close" ? `event.source.postMessage(${JSON.stringify(CLOSE)}, "*");` : ""}
    } else if (opcode === 1) {
      window.__rpc.commands.push(payload);
      if (payload.cmd === "OPEN_EXTERNAL_LINK") {
        event.source.postMessage([1, { cmd: payload.cmd, evt: null, nonce: payload.nonce, data: { opened: true } }], "*");
      }
    }
  });
</script>
<iframe id="activity" title="Activity" src="/${LAUNCH_QUERY}" style="width:960px;height:640px;border:0"></iframe>
</body>
</html>`;
}

async function mockApi(page: Page): Promise<string[]> {
  const requested: string[] = [];
  // Registered first, so it only answers what the mocks below don't.
  await page.route(
    (url) => url.pathname.startsWith("/api/"),
    (route) => {
      requested.push(new URL(route.request().url()).pathname);
      return route.fulfill({ status: 404, json: { detail: "Not Found" } });
    },
  );
  await page.route(
    (url) => url.pathname === "/api/discord/activity-config",
    (route) => {
      requested.push("/api/discord/activity-config");
      return route.fulfill({ json: { client_id: CLIENT_ID } });
    },
  );
  await page.route(
    (url) => url.pathname === "/api/games",
    (route) => route.fulfill({ json: GAMES }),
  );
  await page.route(
    (url) => url.pathname === "/api/games/cs2/maps",
    (route) => route.fulfill({ json: MAPS }),
  );
  return requested;
}

/** Serve the minimap from R2 and from Discord's proxy path; returns every URL it was fetched from. */
async function serveMinimap(page: Page): Promise<string[]> {
  const fetched: string[] = [];
  await page.route(
    (url) => url.hostname.endsWith(".r2.cloudflarestorage.com") || url.pathname.startsWith("/r2/"),
    (route) => {
      fetched.push(route.request().url());
      return route.fulfill({ contentType: "image/png", body: PIXEL_PNG });
    },
  );
  return fetched;
}

/** Answer the SDK's handshake (once it arrives) with READY. */
async function connect(page: Page): Promise<void> {
  await expect.poll(async () => (await rpcLog(page)).handshakes).toEqual([
    expect.objectContaining({ client_id: CLIENT_ID, frame_id: "frame-e2e" }),
  ]);
  await page.evaluate(() => (window as unknown as { __sendReady: () => void }).__sendReady());
}

async function openInDiscord(page: Page, mode: HostMode): Promise<void> {
  await page.route(
    (url) => url.pathname === HOST_PATH,
    (route) => route.fulfill({ contentType: "text/html", body: hostPage(mode) }),
  );
  await page.goto(HOST_PATH);
}

function rpcLog(page: Page): Promise<RpcLog> {
  return page.evaluate(() => (window as unknown as { __rpc: RpcLog }).__rpc);
}

/** Every script the page and its frames load, so a test can look for the SDK. */
function collectScripts(page: Page): Promise<string>[] {
  const bodies: Promise<string>[] = [];
  page.on("response", (response) => {
    if (response.request().resourceType() === "script") bodies.push(response.text().catch(() => ""));
  });
  return bodies;
}

async function loadedSdk(bodies: Promise<string>[]): Promise<boolean> {
  return (await Promise.all(bodies)).some((text) => text.includes(SDK_MARKER));
}

test("inside Discord: connects, shows the game picker, and opens the real site through Discord", async ({ page }) => {
  const scripts = collectScripts(page);
  await mockApi(page);
  await openInDiscord(page, "manual");
  const activity = page.frameLocator("#activity");

  // While Discord hasn't answered: a visible "connecting" state, nothing else.
  await expect(activity.getByRole("status")).toHaveText("Connecting to Discord…");
  await connect(page);

  // The game picker in the slim Activity bar, with no account UI.
  await expect(activity.getByRole("heading", { name: "Games" })).toBeVisible();
  await expect(activity.getByRole("link", { name: /Counter-Strike 2/ })).toBeVisible();
  const bar = activity.getByRole("navigation", { name: "Main navigation" });
  await expect(bar.getByRole("link", { name: "Games" })).toBeVisible();
  await expect(activity.getByRole("link", { name: /sign in/i })).toHaveCount(0);
  expect(await loadedSdk(scripts)).toBe(true);

  // WoW Forever, scrolled to the bottom → Item Compare opens at its top, with
  // pasting first (screenshots need the browser).
  await activity.getByRole("link", { name: /WoW: Forever/ }).click();
  await expect(activity.getByRole("link", { name: /Item Compare/ })).toBeVisible();
  const content = activity.getByTestId("activity-content");
  await content.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  expect(await content.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  await activity.getByRole("link", { name: /Item Compare/ }).click();
  await expect(activity.getByRole("heading", { name: "Item Compare" })).toBeVisible();
  expect(await content.evaluate((el) => el.scrollTop)).toBe(0);
  await expect(activity.getByRole("radio", { name: "Paste from a website" }).first()).toHaveAttribute(
    "aria-checked",
    "true",
  );

  // "Open in browser" asks Discord to open this page on the real site; no tab
  // opens from inside the frame.
  await activity.getByRole("button", { name: "Open in browser" }).click();
  await expect.poll(async () => (await rpcLog(page)).commands.filter((c) => c.cmd === "OPEN_EXTERNAL_LINK")).toEqual([
    expect.objectContaining({ args: { url: `${SITE_URL}/wow-forever/compare` } }),
  ]);
  expect(page.context().pages()).toHaveLength(1);

  // "Games" in the bar leads back to the picker.
  await bar.getByRole("link", { name: "Games" }).click();
  await expect(activity.getByRole("heading", { name: "Games" })).toBeVisible();
});

test("inside Discord: media from the API loads through Discord's proxy", async ({ page }) => {
  await mockApi(page);
  const fetched = await serveMinimap(page);
  await openInDiscord(page, "manual");
  await connect(page);
  const activity = page.frameLocator("#activity");

  await activity.getByRole("link", { name: /Counter-Strike 2/ }).click();
  // R2 is unreachable inside Discord, so the URL is rewritten onto the
  // Activity's own origin under the /r2/{subdomain} mapping.
  const proxied = `https://${new URL(page.url()).host}/r2/0a1b2c3d${R2_PATH}`;
  const minimap = activity.getByRole("img", { name: "Mirage" });
  await expect(minimap).toHaveAttribute("src", proxied);
  await expect.poll(() => minimap.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1);
  expect(fetched).toEqual([proxied]);
});

test("inside Discord: a refused connection explains itself and still lets you browse", async ({ page }) => {
  await mockApi(page);
  await openInDiscord(page, "close");
  const activity = page.frameLocator("#activity");

  await expect(activity.getByRole("heading", { name: "Couldn't connect to Discord" })).toBeVisible();
  await expect(activity.getByText("Discord closed the connection. Try again in a moment.")).toBeVisible();
  await activity.getByRole("button", { name: "Continue anyway" }).click();
  await expect(activity.getByRole("heading", { name: "Games" })).toBeVisible();
  await expect(activity.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
});

test("on the website: nothing changes and the Discord SDK is never downloaded", async ({ page }) => {
  const scripts = collectScripts(page);
  const requested = await mockApi(page);
  const fetched = await serveMinimap(page);
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Games" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open in browser" })).toHaveCount(0);

  // Media URLs stay exactly as the API sent them.
  await page.getByRole("link", { name: /Counter-Strike 2/ }).click();
  await expect(page.getByRole("img", { name: "Mirage" })).toHaveAttribute("src", MINIMAP_URL);
  await expect.poll(() => fetched).toEqual([MINIMAP_URL]);

  await page.waitForLoadState("networkidle");
  expect(await loadedSdk(scripts)).toBe(false);
  expect(requested).not.toContain("/api/discord/activity-config");
});
