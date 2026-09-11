/**
 * Portfolio screenshots for myfreeapps.org/jason/.
 *
 * MyGamingAssistant is public, so it is captured from production. The other
 * apps are captured from local instances seeded with fake demo data by the
 * *.setup.ts files — never from production, where real users' data lives.
 *
 * Output: public/jason/img/<app>.webp (1200px wide, light mode).
 */
import { test, expect, type APIRequestContext, type Browser, type Page } from "@playwright/test";
import fs from "fs";
import path from "path";
import { DEMO_EMAIL, DEMO_PASSWORD } from "./fixtures/demo-user";
import { INVOICE_VENDOR } from "./fixtures/mbk/invoice";
import { HERO_TITLE } from "./fixtures/myrecipes/recipes";
import { psql } from "./local-db";

const MBK_URL = process.env.MBK_URL ?? "http://localhost:5190";
const MJH_URL = process.env.MJH_URL ?? "http://localhost:5191";
const MYRECIPES_URL = process.env.MYRECIPES_URL ?? "http://localhost:5192";
const OUT_DIR = path.resolve(__dirname, "..", "public", "jason", "img");
const VIEWPORT = { width: 1440, height: 900 };
const WEBP_QUALITY = 0.82;

type Clip = { x: number; y: number; width: number; height: number };

async function newPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ viewport: VIEWPORT, colorScheme: "light" });
  return context.newPage();
}

/** Fails if any <img> inside the clip rectangle is broken or still loading. */
async function expectImagesLoaded(page: Page, clip: Clip): Promise<void> {
  await expect
    .poll(
      () =>
        page.$$eval(
          "img",
          (imgs, c) =>
            imgs
              .filter((img) => {
                const r = img.getBoundingClientRect();
                const visible =
                  r.width > 0 && r.right > c.x && r.left < c.x + c.width && r.bottom > c.y && r.top < c.y + c.height;
                return visible && (!img.complete || img.naturalWidth === 0);
              })
              .map((img) => img.currentSrc || img.src),
          clip,
        ),
      { timeout: 30_000, message: "images in the screenshot area must all load" },
    )
    .toEqual([]);
}

/**
 * Screenshot `clip` and write it as WebP. Playwright only emits PNG/JPEG, so
 * the PNG is re-encoded by Chromium's canvas encoder on a blank page (no app
 * CSP in the way, no image-tooling dependency).
 */
async function saveWebp(page: Page, clip: Clip, name: string): Promise<void> {
  const png = await page.screenshot({ clip, animations: "disabled", caret: "hide" });
  const encoder = await page.context().newPage();
  const dataUrl = await encoder.evaluate(
    async ({ b64, quality }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext("2d")!.drawImage(img, 0, 0);
      return canvas.toDataURL("image/webp", quality);
    },
    { b64: png.toString("base64"), quality: WEBP_QUALITY },
  );
  await encoder.close();
  expect(dataUrl.startsWith("data:image/webp")).toBe(true);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, `${name}.webp`), Buffer.from(dataUrl.split(",")[1], "base64"));
}

/** A page whose localStorage holds `storage` (the JWT under "token", plus any app state) before any app code runs. */
async function signedInPage(browser: Browser, storage: Record<string, string>): Promise<Page> {
  const page = await newPage(browser);
  await page.addInitScript((entries) => {
    for (const [key, value] of Object.entries(entries)) window.localStorage.setItem(key, value);
  }, storage);
  page.setDefaultTimeout(30_000);
  return page;
}

/** fastapi-users' OAuth2 password form login — MyBookkeeper and MyJobHunter. */
async function formLogin(request: APIRequestContext, origin: string): Promise<string> {
  const login = await request.post(`${origin}/api/auth/jwt/login`, {
    form: { username: DEMO_EMAIL, password: DEMO_PASSWORD },
  });
  expect(login.status(), "run the seed project first").toBe(200);
  return (await login.json()).access_token;
}

test("MyRecipes — v1 → v4 diff of the hero recipe (local demo data)", async ({ browser, request }) => {
  const api = `${MYRECIPES_URL}/api`;
  const login = await request.post(`${api}/auth/totp/login`, {
    data: { email: DEMO_EMAIL, password: DEMO_PASSWORD },
  });
  expect(login.status()).toBe(200);
  const { access_token: token } = await login.json();
  const headers = { Authorization: `Bearer ${token}` };

  const recipes = await (
    await request.get(`${api}/recipes?owner=me&search=${encodeURIComponent(HERO_TITLE)}`, { headers })
  ).json();
  const hero = recipes.find((r: { title: string }) => r.title === HERO_TITLE);
  const versions: { id: string; version_number: number }[] = await (
    await request.get(`${api}/recipes/${hero.id}/versions`, { headers })
  ).json();
  const byNumber = (n: number) => versions.find((v) => v.version_number === n)!.id;

  const page = await signedInPage(browser, { token });
  await page.goto(`${MYRECIPES_URL}/recipes/${hero.id}/versions/${byNumber(4)}/diff?against=${byNumber(1)}`);
  await expect(page.getByText("6 changes")).toBeVisible();
  await saveWebp(page, { x: 240, y: 56, width: 1200, height: 800 }, "myrecipes");
});

test("MyBookkeeper — transaction extracted from the plumbing invoice (local demo data)", async ({ browser, request }) => {
  const token = await formLogin(request, MBK_URL);
  const orgs: { id: string }[] = await (
    await request.get(`${MBK_URL}/api/organizations`, { headers: { Authorization: `Bearer ${token}` } })
  ).json();

  const page = await signedInPage(browser, { token, v1_activeOrgId: orgs[0].id });
  await page.goto(`${MBK_URL}/transactions`);
  // A hidden mobile card list repeats every amount, so target the desktop table row.
  await page
    .locator("tbody tr")
    .filter({ hasText: INVOICE_VENDOR })
    .first()
    .getByText("$1,932.71")
    .click();
  await expect(page.getByRole("heading", { name: INVOICE_VENDOR })).toBeVisible();
  await expect(page.getByText("plumbing-invoice.png")).toBeVisible();
  // Right of the 224px nav sidebar: the invoice's row in the list and its side panel.
  await saveWebp(page, { x: 240, y: 0, width: 1200, height: 800 }, "mybookkeeper");
});

test("MyJobHunter — hallucination guard in resume refinement (local demo data)", async ({ browser, request }) => {
  const token = await formLogin(request, MJH_URL);
  const sessionId = psql(
    "myjobhunter",
    `SELECT s.id FROM resume_refinement_sessions s JOIN users u ON u.id = s.user_id ` +
      `WHERE u.email = '${DEMO_EMAIL}' ORDER BY s.created_at DESC LIMIT 1;`,
  );
  expect(sessionId, "run the seed project first").not.toBe("");

  const page = await signedInPage(browser, { token, "mjh:resumeRefinementSessionId": sessionId });
  await page.goto(`${MJH_URL}/resume`);
  // The chat opens on its latest turn; bring back the exchange where the user asked for
  // facts the resume doesn't contain and the guard declined to add them.
  const guardReply = page.getByText(/I almost added some details that aren't in your resume/).first();
  await expect(page.getByText(/Make this more quantitative/)).toHaveCount(1);
  await guardReply.evaluate((el) => el.scrollIntoView({ block: "end" }));
  await expect(page.getByText(/Make this more quantitative/)).toBeInViewport();
  await expect(guardReply).toBeInViewport();
  // Right of the 240px nav sidebar, below the 56px top bar: the draft and the chat.
  await saveWebp(page, { x: 240, y: 56, width: 1200, height: 800 }, "myjobhunter");
});

test("MyGamingAssistant — Ascent map with lineup pins (production, public)", async ({ browser }) => {
  const page = await newPage(browser);
  await page.goto("https://mygamingassistant.myfreeapps.org/valorant/ascent", { waitUntil: "networkidle" });
  // Right of the 240px nav sidebar, below the 56px top bar: filter bar, minimap, lineup list.
  const clip = { x: 240, y: 56, width: 1200, height: 600 };
  await expectImagesLoaded(page, clip);
  await saveWebp(page, clip, "mygamingassistant");
});
