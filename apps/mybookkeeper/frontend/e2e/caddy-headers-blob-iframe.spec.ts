/**
 * Structural contract test for `apps/mybookkeeper/docker/Caddyfile.docker`.
 *
 * Background — the 2026-05-01 production failure:
 *   `DocumentViewer.tsx` fetches a PDF with axios `responseType: 'blob'`,
 *   wraps it in a `blob:` URL, and renders it inside an in-app iframe. In
 *   production the iframe rendered Chrome's "This content is blocked" page,
 *   even though "Open in new tab" on the same blob URL worked correctly.
 *
 * The cause: when `X-Frame-Options "DENY"` and CSP `frame-ancestors 'none'`
 * are set on the *download* response, Chrome enforces those framing
 * restrictions on the synthesized blob URL when it's loaded inside an
 * iframe (top-level navigation is not subject to those checks, which is
 * why the new-tab fallback worked). Local-HTTP synthetic reproduction is
 * unreliable because some of these checks are gated on a secure context.
 *
 * The fix: scope `X-Frame-Options` and CSP `frame-ancestors` to the SPA
 * HTML response only — they belong on the HTML document, not on JSON /
 * binary API responses. This contract test enforces that scoping so the
 * regression cannot ship again silently.
 */
import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CADDYFILE = path.resolve(__dirname, "..", "..", "docker", "Caddyfile.docker");

interface CaddyBlock {
  // Raw text of the block contents (excluding outer braces).
  body: string;
}

/**
 * Extract the body of a brace-delimited block whose opener line matches
 * `headerPattern`. Returns the first match.
 */
function extractBlock(source: string, headerPattern: RegExp): CaddyBlock | null {
  const match = headerPattern.exec(source);
  if (!match) return null;
  const startIdx = source.indexOf("{", match.index + match[0].length - 1);
  if (startIdx === -1) return null;
  let depth = 1;
  let i = startIdx + 1;
  while (i < source.length && depth > 0) {
    const ch = source[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") depth -= 1;
    if (depth === 0) break;
    i += 1;
  }
  if (depth !== 0) return null;
  return { body: source.slice(startIdx + 1, i) };
}

test.describe("Caddyfile.docker — XFO + CSP frame-ancestors are not applied to API responses", () => {
  const caddyfile = fs.readFileSync(CADDYFILE, "utf-8");

  test("the top-level response-headers block does NOT set X-Frame-Options", () => {
    // The top-level `header { defer ... }` inside `handle { }` runs for ALL
    // responses including /api/*. It must NOT set X-Frame-Options or CSP
    // frame-ancestors here. Those belong only on the SPA HTML response.
    const topHeader = extractBlock(caddyfile, /handle\s*\{\s*\n[^]*?header\s*\{\s*defer/);
    expect(topHeader, "could not locate top-level header block").not.toBeNull();
    expect(
      topHeader!.body,
      "Top-level header block must not set X-Frame-Options — it propagates to /api/* responses and breaks blob iframe rendering in DocumentViewer"
    ).not.toMatch(/X-Frame-Options/i);
    expect(
      topHeader!.body,
      "Top-level header block must not set Content-Security-Policy — frame-ancestors propagates to /api/* responses and breaks blob iframe rendering"
    ).not.toMatch(/Content-Security-Policy/i);
  });

  test("the SPA fallback handler DOES set X-Frame-Options and CSP frame-ancestors", () => {
    // The SPA HTML response is what XFO and CSP frame-ancestors actually
    // exist to protect. Removing them entirely would weaken anti-clickjacking
    // protection — keep them on the SPA handler.
    //
    // We locate the trailing inner `handle { ... }` (the one without a path
    // matcher) and verify it sets both directives.
    const spaHandle = caddyfile.match(/# SPA fallback for frontend\.[\s\S]*?handle\s*\{([\s\S]*?)\n\s*\}\s*\n\s*\}\s*\n\s*\}/);
    expect(spaHandle, "could not locate SPA fallback handler").not.toBeNull();
    expect(spaHandle![1]).toMatch(/X-Frame-Options\s+"DENY"/);
    expect(spaHandle![1]).toMatch(/frame-ancestors\s+'none'/);
  });

  test("the API handler does NOT contain XFO or CSP frame-ancestors directives", () => {
    // The /api/* handler proxies to the backend with no security-header
    // modifications. This test guards against future changes that might
    // re-add XFO/CSP at this layer.
    const apiHandle = caddyfile.match(/handle\s+\/api\/\*\s*\{([\s\S]*?)\n\s*\}/);
    expect(apiHandle, "could not locate /api/* handler").not.toBeNull();
    expect(apiHandle![1]).not.toMatch(/X-Frame-Options/i);
    expect(apiHandle![1]).not.toMatch(/frame-ancestors/i);
  });
});
