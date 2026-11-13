/**
 * Stubs MyLanguageTutor's own API the way the backend answers it (app/api/
 * catalog.py, profile.py, sessions.py, turns.py, usage.py): reads come from
 * state the writes change, request bodies are checked like the pydantic
 * schemas (422), unknown languages and scenarios are 422 like the registries,
 * a turn for a session the server never created is 404 session_not_found, and
 * accepted turns stream SSE. Each streamed turn takes the next seq (failed ones
 * too, like tutor_turn_repository.next_seq); only a turn that wasn't failed
 * adds to turn_count. Endpoints named in `failWith` answer an unhandled 500
 * (Starlette's plain-text body) until the spec calls stopFailing().
 */
import type { Page, Route } from "@playwright/test";
import { json, plainText } from "@platform/ui/test-support/mockResponse";
import { recordWrite } from "@platform/ui/test-support/recordWrite";
import type { Profile } from "@mylanguagetutor/api-client/types/tutor/profile";
import type { ProfileUpdate } from "@mylanguagetutor/api-client/types/tutor/profile-update";
import type { SessionCreate } from "@mylanguagetutor/api-client/types/tutor/session-create";
import type { TutorSession } from "@mylanguagetutor/api-client/types/tutor/tutor-session";
import { PROFILE_FIELDS, SESSION_FIELDS, TURN_FIELDS } from "../constants/backendLimits";
import { NOW } from "../constants/fixtureTimes";
import { DEFAULT_REPLY } from "../constants/practiceText";
import { INTERNAL_ERROR, SESSION_NOT_FOUND } from "../constants/refusalDetails";
import type { TurnScript } from "../types/TurnScript";
import type { TutorApi } from "../types/TutorApi";
import type { TutorApiStubOptions } from "../types/TutorApiStubOptions";
import type { ValidationErrorBody } from "../types/ValidationErrorBody";
import { SCENARIOS, SPANISH } from "./catalogFixtures";
import { sessionIdAt, turnIdAt } from "./fixtureIds";
import { validationError } from "./requestValidation";
import { completeTurn, sseBody } from "./turnEvents";
import { PLENTY_LEFT, profileOf, sessionOf } from "./tutorFixtures";

const API_PREFIX = "/api";
const TURN_PATH = /^\/sessions\/([^/]+)\/turns$/;
/** GET /scenarios without its required ?language= (FastAPI reports a missing query with input null). */
const MISSING_LANGUAGE_QUERY: ValidationErrorBody = {
  detail: [{ type: "missing", loc: ["query", "language"], msg: "Field required", input: null }],
};

export async function stubTutorApi(
  page: Page,
  { profile: initialProfile = profileOf(), usage = PLENTY_LEFT, languages = [SPANISH], turns = [], holdTurns, failWith = [] }: TutorApiStubOptions = {},
): Promise<TutorApi> {
  let profile: Profile | null = initialProfile;
  const sessions = new Map<string, TutorSession>();
  const failing = new Set(failWith);
  const scripts: TurnScript[] = [...turns];
  let turnsSent = 0;
  /** Turn rows saved per session, failed ones included: what next_seq counts. */
  const savedTurns = new Map<string, number>();
  const api: TutorApi = { writes: [], reads: [], turnRequests: [], stopFailing: (key) => failing.delete(key) };

  const unknownLanguage = (code: string) => json({ detail: `Unsupported language: ${code}` }, 422);
  const supported = (code: string) => languages.some((language) => language.code === code);

  async function answerTurn(route: Route, sessionId: string, body: unknown): Promise<void> {
    const invalid = validationError(body, TURN_FIELDS);
    if (invalid) return route.fulfill(json(invalid, 422));
    if (holdTurns) await holdTurns.wait;
    const session = sessions.get(sessionId);
    if (!session) return route.fulfill(json({ detail: SESSION_NOT_FOUND }, 404));
    turnsSent += 1;
    const script = scripts.shift() ?? completeTurn({ reply: DEFAULT_REPLY });
    if (script.kind === "refusal") return route.fulfill(json({ detail: script.detail }, script.status));
    const seq = (savedTurns.get(sessionId) ?? 0) + 1;
    savedTurns.set(sessionId, seq);
    const failed = script.events.some(({ event, data }) => event === "done" && data.status === "failed");
    sessions.set(sessionId, { ...session, turn_count: session.turn_count + (failed ? 0 : 1), updated_at: NOW });
    const started = { event: "turn.started", data: { turn_id: turnIdAt(turnsSent), seq } };
    return route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      headers: { "cache-control": "no-cache" },
      body: sseBody([started, ...script.events]),
    });
  }

  await page.route(/\/api\/(languages|scenarios|profile|sessions|usage)(\/.*)?(\?.*)?$/, async (route) => {
    const request = route.request();
    const method = request.method();
    const url = new URL(request.url());
    const path = url.pathname.replace(API_PREFIX, "");
    const key = `${method} ${path}`;

    const turnSession = method === "POST" ? TURN_PATH.exec(path)?.[1] : undefined;
    let body: unknown = null;
    if (method === "GET") api.reads.push(path + url.search);
    else if (turnSession) {
      body = request.postDataJSON();
      api.turnRequests.push({ sessionId: turnSession, body, authorization: request.headers().authorization ?? null });
    } else body = recordWrite(api.writes, request);
    if (failing.has(key)) return route.fulfill(plainText(INTERNAL_ERROR, 500));

    if (method === "GET" && path === "/languages") return route.fulfill(json(languages));
    if (method === "GET" && path === "/scenarios") {
      const language = url.searchParams.get("language");
      if (!language) return route.fulfill(json(MISSING_LANGUAGE_QUERY, 422));
      return route.fulfill(supported(language) ? json(SCENARIOS) : unknownLanguage(language));
    }
    if (method === "GET" && path === "/profile") return route.fulfill(json(profile));
    if (method === "GET" && path === "/usage/today") return route.fulfill(json(usage));

    if (turnSession) return answerTurn(route, turnSession, body);
    if (method === "PUT" && path === "/profile") {
      const invalid = validationError(body, PROFILE_FIELDS);
      if (invalid) return route.fulfill(json(invalid, 422));
      const update = body as ProfileUpdate;
      if (!supported(update.language_code)) return route.fulfill(unknownLanguage(update.language_code));
      profile = { language_code: update.language_code, level: update.level, updated_at: NOW };
      return route.fulfill(json(profile));
    }
    if (method === "POST" && path === "/sessions") {
      const invalid = validationError(body, SESSION_FIELDS);
      if (invalid) return route.fulfill(json(invalid, 422));
      const create = body as SessionCreate;
      if (!supported(create.language_code)) return route.fulfill(unknownLanguage(create.language_code));
      if (!SCENARIOS.some((scenario) => scenario.slug === create.scenario_slug)) {
        return route.fulfill(json({ detail: `Unknown scenario: ${create.scenario_slug}` }, 422));
      }
      const session = sessionOf(sessionIdAt(sessions.size + 1), create);
      sessions.set(session.id, session);
      return route.fulfill(json(session, 201));
    }
    // Session history, end and delete are not used by the web app, so they stay unstubbed (404) rather than faked.
    return route.fulfill(json({ detail: "Not Found" }, 404));
  });

  return api;
}
