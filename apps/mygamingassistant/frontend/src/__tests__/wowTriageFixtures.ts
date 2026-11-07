/** Shared triage fixtures for the wowTriage*.test.* files (not a test itself). */
import { AxiosError, AxiosHeaders } from "axios";
import type { AxiosResponse, InternalAxiosRequestConfig } from "axios";
import { notifyAuthChange } from "@platform/ui";
import type { TriageInbox } from "@/games/wow-forever/types/featureRequests/triage/triageInbox";
import type { TriageInboxItem } from "@/games/wow-forever/types/featureRequests/triage/triageInboxItem";
import type { TriageStory } from "@/games/wow-forever/types/featureRequests/triage/triageStory";

/** A JWT-shaped fixture (never signed, never sent anywhere real) whose `exp` is far in the future. */
export const FIXTURE_OPERATOR_TOKEN = [
  btoa(JSON.stringify({ alg: "HS256", typ: "JWT" })),
  btoa(JSON.stringify({ sub: "fixture-operator", exp: 4102444800 })),
  "fixture-signature",
].join(".");

/** Sign the operator in (the shared client reads the token from localStorage). */
export function signInOperator(): void {
  window.localStorage.setItem("token", FIXTURE_OPERATOR_TOKEN);
  notifyAuthChange();
}

/** Sign out the way the shared 401 interceptor does: clear the token, tell subscribers. */
export function dropSession(): void {
  window.localStorage.removeItem("token");
  notifyAuthChange();
}

export function triageStory(n: number, patch: Partial<TriageStory> = {}): TriageStory {
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
    created_at: "2026-11-01T00:00:00Z",
    updated_at: `2026-11-01T00:00:0${n % 10}.123456+00:00`,
    submissions: [],
    ...patch,
  };
}

export function inboxItem(n: number, story: TriageStory | null, patch: Partial<TriageInboxItem> = {}): TriageInboxItem {
  const hex = n.toString(16).padStart(2, "0");
  return {
    submission_id: `5555${hex}${hex}-0000-4000-8000-0000000000${hex}`,
    verdict: "new",
    untrusted_submission_text: `Please add idea ${n}`,
    untrusted_clarification_answer: null,
    context: { class_id: null, experience: null, level_band: null, professions: [], activities: [], faction: null },
    claude_reason: null,
    nuance_note: null,
    parent_submission_id: null,
    model_id: "claude-test",
    story,
    created_at: "2026-11-05T00:00:00Z",
    ...patch,
  };
}

export function inbox(items: TriageInboxItem[]): TriageInbox {
  return { items, total_untriaged: items.length };
}

/** A resolved axios response, as the shared `api.request` returns it. */
export function axiosOk<T>(data: T): AxiosResponse<T> {
  return { data, status: 200, statusText: "OK", headers: {}, config: { headers: new AxiosHeaders() } as InternalAxiosRequestConfig };
}

/** The error axios throws for a non-2xx answer (headers lowercased, as the fetch adapter gives them). */
export function axiosFailure(status: number, data: unknown, headers: Record<string, string> = {}): AxiosError {
  const config = { headers: new AxiosHeaders() } as InternalAxiosRequestConfig;
  const response: AxiosResponse = { data, status, statusText: "", headers, config };
  return new AxiosError(`Request failed with status code ${status}`, AxiosError.ERR_BAD_REQUEST, config, undefined, response);
}

/** Stub `window.matchMedia` (jsdom has none) — the shared Panel picks drawer vs dialog with it. */
export function stubMatchMedia(matches = false): MediaQueryList {
  const list = {
    matches,
    media: "",
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  } as unknown as MediaQueryList;
  window.matchMedia = () => list;
  return list;
}
