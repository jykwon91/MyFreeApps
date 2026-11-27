import { TURNSTILE_SCRIPT_URL } from "../constants/turnstile";
import { parseTurnstileMessage } from "../utils/parseTurnstileMessage";
import { scriptLiteral } from "../utils/scriptLiteral";
import { turnstileHtml } from "../utils/turnstileHtml";
import { turnstileNavigation } from "../utils/turnstileNavigation";
import { webOrigin } from "../utils/webOrigin";

const SITE = "https://myrecipes.example.org";

describe("webOrigin", () => {
  it.each([
    ["https://myrecipes.example.org", SITE],
    ["https://MyRecipes.Example.org/", SITE],
    ["https://myrecipes.example.org/path?q#f", SITE],
    ["http://localhost:5180/x", "http://localhost:5180"],
  ])("reads %s as %s", (url, origin) => {
    expect(webOrigin(url)).toBe(origin);
  });

  it.each([
    "https://challenges.cloudflare.com@evil.example",
    "https://challenges.cloudflare.com\\evil.example",
    "javascript:alert(1)",
    "intent://scan#Intent;end",
    "ftp://files.example.org",
    "about:blank",
  ])("refuses %s", (url) => {
    expect(webOrigin(url)).toBeNull();
  });
});

describe("turnstileNavigation", () => {
  it.each([
    [SITE, true],
    [`${SITE}/`, true],
    [`${SITE}/#x`, false],
    ["https://challenges.cloudflare.com/cdn-cgi/challenge-platform/h/b/turnstile/if/ov2", false],
    ["https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit", true],
    ["about:blank", false],
    ["about:srcdoc", false],
  ] as const)("loads %s inside", (url, isTopFrame) => {
    expect(turnstileNavigation(url, SITE, isTopFrame)).toBe("load");
  });

  it.each([
    "https://www.cloudflare.com/privacypolicy/",
    `${SITE}/register`,
    "https://myrecipes.example.org.evil.example/",
  ])("sends a tapped link to %s to the browser", (url) => {
    expect(turnstileNavigation(url, SITE, true)).toBe("openOutside");
  });

  it.each([
    ["https://evil.example/frame", false],
    ["https://challenges.cloudflare.com@evil.example/", true],
    ["http://insecure.example/", true],
    ["javascript:alert(1)", true],
    ["tel:5551234", true],
    ["intent://scan#Intent;end", true],
    ["file:///etc/hosts", true],
  ] as const)("drops %s", (url, isTopFrame) => {
    expect(turnstileNavigation(url, SITE, isTopFrame)).toBe("block");
  });
});

describe("parseTurnstileMessage", () => {
  it.each([
    [{ type: "ready" }, { type: "ready" }],
    [{ type: "expired" }, { type: "expired" }],
    [{ type: "token", token: "abc" }, { type: "token", token: "abc" }],
    [{ type: "error", code: "110200" }, { type: "error", code: "110200" }],
    [{ type: "error" }, { type: "error", code: "unknown" }],
  ])("reads %j", (message, parsed) => {
    expect(parseTurnstileMessage(JSON.stringify(message))).toEqual(parsed);
  });

  it.each([
    "not json",
    "null",
    '"token"',
    JSON.stringify({ type: "token" }),
    JSON.stringify({ type: "token", token: "" }),
    JSON.stringify({ type: "token", token: 42 }),
    JSON.stringify({ type: "token", token: "x".repeat(2049) }),
    JSON.stringify({ type: "navigate", url: "https://evil.example" }),
  ])("ignores %s", (data) => {
    expect(parseTurnstileMessage(data)).toBeNull();
  });
});

describe("the captcha page", () => {
  it("can't be broken out of by the site key", () => {
    const hostile = `</script><script>alert(1)</script>"\u2028`;
    const literal = scriptLiteral({ sitekey: hostile });
    expect(literal).not.toContain("</script>");
    expect(literal).not.toContain("<");
    expect(literal).not.toContain("\u2028");
    expect(JSON.parse(literal)).toEqual({ sitekey: hostile });

    const html = turnstileHtml(hostile, false);
    expect(html.match(/<script>/g)).toHaveLength(1);
    expect(html.match(/<\/script>/g)).toHaveLength(1);
  });

  it("loads Cloudflare's script explicitly, with the site key and the phone's theme, under a tight policy", () => {
    const light = turnstileHtml("0xKEY", false);
    expect(light).toContain(scriptLiteral({ sitekey: "0xKEY", theme: "light", scriptUrl: TURNSTILE_SCRIPT_URL }));
    expect(TURNSTILE_SCRIPT_URL).toBe("https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit");
    expect(light).toContain("window.ReactNativeWebView.postMessage");
    expect(light).toMatch(/Content-Security-Policy" content="script-src 'unsafe-inline' https:\/\/challenges\.cloudflare\.com; frame-src https:\/\/challenges\.cloudflare\.com/);
    expect(turnstileHtml("0xKEY", true)).toContain('"theme":"dark"');
  });
});
