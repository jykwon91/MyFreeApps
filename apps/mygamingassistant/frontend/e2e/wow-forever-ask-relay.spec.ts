/**
 * WoW Forever "Ask" chat relay — POST /api/wow/chat/turn against a real backend.
 *
 * Contract checks that never reach Claude (so they cost nothing): the body cap
 * runs before anything else, a configured relay rejects a tool-result turn
 * with a bad or missing ticket before spending, and an unconfigured relay
 * answers 503 `chat_unavailable`. The chat page's
 * own flows stub this endpoint in `wow-forever-ask.spec.ts`.
 *
 * Prereqs: backend on BACKEND_URL (default :8004).
 */
import { test, expect, type APIRequestContext } from "@playwright/test";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8004";
const TURN_URL = `${BACKEND_URL}/api/wow/chat/turn`;
const MAX_BODY_BYTES = 64 * 1024;

const QUESTION = { role: "user", content: [{ type: "text", text: "where is the closest warlock trainer" }] };
const TOOL_CALL = {
  role: "assistant",
  content: [{ type: "tool_use", id: "toolu_e2e", name: "search_npcs", input: { query: "warlock trainer" } }],
};
const TOOL_RESULT = {
  role: "user",
  content: [{ type: "tool_result", tool_use_id: "toolu_e2e", content: '{"results":[]}', is_error: false }],
};

async function relayIsConfigured(request: APIRequestContext): Promise<boolean> {
  // A continuation with a bad ticket is rejected before Turnstile or Claude — free to send.
  const probe = await request.post(TURN_URL, { data: { messages: [QUESTION, TOOL_CALL, TOOL_RESULT], ticket: "x.y" } });
  return probe.status() !== 503;
}

test.describe("WoW Forever Ask relay API", () => {
  test.beforeEach(async ({ request }) => {
    const health = await request.get(`${BACKEND_URL}/health`).catch(() => null);
    test.skip(!health?.ok(), `backend not reachable at ${BACKEND_URL}`);
  });

  test("a body over 64 KB is refused before it's read", async ({ request }) => {
    const resp = await request.post(TURN_URL, {
      headers: { "Content-Type": "application/json" },
      data: `{"messages":[],"pad":"${"x".repeat(MAX_BODY_BYTES)}"}`,
    });
    expect(resp.status()).toBe(413);
    expect(await resp.json()).toEqual({ detail: "chat_body_too_large" });
  });

  test("a configured relay rejects a tool-result turn with a forged or missing ticket", async ({ request }) => {
    test.skip(!(await relayIsConfigured(request)), "relay not configured on this backend");

    const forged = await request.post(TURN_URL, {
      data: { messages: [QUESTION, TOOL_CALL, TOOL_RESULT], ticket: "eyJ2IjoxfQ.c2ln" },
    });
    expect(forged.status()).toBe(400);
    expect(await forged.json()).toEqual({ detail: "chat_ticket_invalid" });

    const missing = await request.post(TURN_URL, { data: { messages: [QUESTION, TOOL_CALL, TOOL_RESULT] } });
    expect(missing.status()).toBe(400);
    expect(await missing.json()).toEqual({ detail: "chat_ticket_required" });
  });

  test("an unconfigured relay says so instead of failing", async ({ request }) => {
    test.skip(await relayIsConfigured(request), "relay is configured on this backend");
    const resp = await request.post(TURN_URL, { data: { messages: [QUESTION] } });
    expect(resp.status()).toBe(503);
    expect(await resp.json()).toEqual({ detail: "chat_unavailable" });
  });
});
