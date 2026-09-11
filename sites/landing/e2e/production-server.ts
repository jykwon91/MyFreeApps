/**
 * Serve sites/landing/public/ to Playwright the way production does: every
 * request to https://myfreeapps.org is fulfilled from ../public/ with the
 * headers of the `myfreeapps.org` block in infra/Caddyfile (CSP included), so
 * a change the CSP would silently break in the browser fails the test. App
 * subdomains are stubbed so outbound links can be followed without the network.
 */
import type { Page } from "@playwright/test";
import fs from "fs";
import path from "path";

const PUBLIC_DIR = path.resolve(__dirname, "..", "public");
const CADDYFILE = path.resolve(__dirname, "..", "..", "..", "infra", "Caddyfile");
export const ORIGIN = "https://myfreeapps.org";

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

export function productionHeaders(): Record<string, string> {
  const caddyfile = fs.readFileSync(CADDYFILE, "utf-8");
  const block = /^myfreeapps\.org \{\r?\n([\s\S]*?)^\}/m.exec(caddyfile);
  if (!block) throw new Error("infra/Caddyfile has no `myfreeapps.org {` block");
  const headerBlock = /header \{\r?\n([\s\S]*?)\r?\n\s*\}/.exec(block[1]);
  if (!headerBlock) throw new Error("myfreeapps.org block has no `header { ... }`");
  const headers: Record<string, string> = {};
  for (const line of headerBlock[1].split(/\r?\n/)) {
    const directive = /^\s*([A-Za-z-]+)\s+"(.*)"\s*$/.exec(line);
    if (directive) headers[directive[1]] = directive[2];
  }
  return headers;
}

export async function serveLikeProduction(page: Page): Promise<void> {
  const headers = productionHeaders();
  await page.context().route(
    (url) => url.hostname === "myfreeapps.org",
    async (route) => {
      const { pathname } = new URL(route.request().url());
      // Caddy's file_server serves a directory's index.html.
      const file = path.join(PUBLIC_DIR, pathname.endsWith("/") ? `${pathname}index.html` : pathname);
      if (!file.startsWith(PUBLIC_DIR) || !fs.existsSync(file)) {
        await route.fulfill({ status: 404, headers, body: "" });
        return;
      }
      await route.fulfill({
        status: 200,
        headers: { ...headers, "Content-Type": CONTENT_TYPES[path.extname(file)] },
        body: fs.readFileSync(file),
      });
    },
  );
  await page.context().route(
    (url) => url.hostname.endsWith(".myfreeapps.org"),
    (route) =>
      route.fulfill({
        contentType: "text/html",
        body: `<title>${new URL(route.request().url()).hostname}</title>`,
      }),
  );
}
