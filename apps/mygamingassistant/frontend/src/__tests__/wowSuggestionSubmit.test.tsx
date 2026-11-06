import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { Provider } from "react-redux";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useSuggestionSubmit } from "@/games/wow-forever/hooks/featureRequests/useSuggestionSubmit";
import { useMyIdeas } from "@/games/wow-forever/hooks/featureRequests/useMyIdeas";
import { useAboutYou } from "@/games/wow-forever/hooks/featureRequests/useAboutYou";
import { readSuggestionDraft } from "@/games/wow-forever/lib/featureRequests/suggestionDraft";
import { PLAYER_SETTINGS_STORAGE_KEY } from "@/games/wow-forever/hooks/usePlayerSettings";
import { store } from "@/lib/store";
import type { PublicStory } from "@/games/wow-forever/types/featureRequests/publicStory";

const submitFeatureRequest = vi.hoisted(() => vi.fn());
const siteKey = vi.hoisted(() => ({ value: "" }));

vi.mock("@/games/wow-forever/api/wowFeatureRequestsApi", () => ({
  submitFeatureRequest,
  invalidateFeatureRequests: () => ({ type: "test/invalidate" }),
}));

vi.mock("@/games/wow-forever/lib/humanCheckAvailability", () => ({
  turnstileSiteKey: () => siteKey.value,
}));

const CLIENT = "33333333-3333-4333-8333-333333333333";
const STORY_ID = "11111111-1111-4111-8111-111111111111";
const SUBMISSION_ID = "44444444-4444-4444-8444-444444444444";

const STORY_TEXT = {
  id: STORY_ID,
  title: "Alchemy leveling route",
  persona: "new Alchemist",
  i_want: "a cheapest route to 300",
  so_that: "I don't waste herbs",
  acceptance_criteria: ["Shows each recipe"],
  follow_ups: [],
  area: "professions" as const,
  topic: "alchemy",
  feasibility: "feasible" as const,
  feasibility_note: null,
};

const PUBLIC_STORY: PublicStory = {
  ...STORY_TEXT,
  status: "open",
  operator_note: null,
  shipped_path: null,
  vote_count: 3,
  created_at: "2026-11-01T00:00:00Z",
};

function wrapper({ children }: { children: ReactNode }) {
  return <Provider store={store}>{children}</Provider>;
}

function renderSubmit(onNewStory = vi.fn()) {
  return { onNewStory, ...renderHook(() => useSuggestionSubmit(CLIENT, onNewStory), { wrapper }) };
}

beforeEach(() => {
  submitFeatureRequest.mockReset();
  siteKey.value = "";
});

afterEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe("useSuggestionSubmit", () => {
  it("keeps the draft in sessionStorage as it's typed", () => {
    const { result } = renderSubmit();
    act(() => result.current.setText("Show me fishing spots"));
    expect(readSuggestionDraft()).toBe("Show me fishing spots");
  });

  it("stops a too-short idea before calling the server", () => {
    const { result } = renderSubmit();
    act(() => result.current.setText("short"));
    act(() => result.current.send({}));
    expect(submitFeatureRequest).not.toHaveBeenCalled();
    expect(result.current.view).toEqual({
      view: "compose",
      failure: { kind: "too_short", retryAfterSeconds: null },
      correcting: false,
    });
  });

  it("shows a new story, remembers it and clears the draft", async () => {
    submitFeatureRequest.mockResolvedValue({
      verdict: "new",
      submission_id: SUBMISSION_ID,
      story: { ...STORY_TEXT, status: "submitted" },
    });
    const { result, onNewStory } = renderSubmit();
    act(() => result.current.setText("A route to level Alchemy cheaply"));
    act(() => result.current.send({ class_id: "mage", professions: [] }));
    expect(result.current.submittingSince).not.toBeNull();
    await waitFor(() => expect(result.current.view.view).toBe("new"));
    expect(submitFeatureRequest.mock.calls[0][0]).toEqual({
      text: "A route to level Alchemy cheaply",
      client_id: CLIENT,
      context: { class_id: "mage" },
    });
    expect(onNewStory).toHaveBeenCalledWith(STORY_ID, "Alchemy leveling route");
    expect(readSuggestionDraft()).toBe("");
    expect(result.current.submittingSince).toBeNull();
  });

  it("resets the human check after every attempt that reached the server", async () => {
    siteKey.value = "site-key";
    submitFeatureRequest.mockRejectedValue({ response: { status: 500, data: {}, headers: {} } });
    const { result } = renderSubmit();
    act(() => result.current.turnstile.onVerify("tok-1"));
    act(() => result.current.setText("A route to level Alchemy cheaply"));
    const before = result.current.turnstile.resetKey;
    act(() => result.current.send({}));
    await waitFor(() => expect(result.current.submittingSince).toBeNull());
    expect(submitFeatureRequest.mock.calls[0][1]).toBe("tok-1");
    expect(result.current.turnstile.resetKey).toBe(before + 1);
    expect(result.current.turnstile.token).toBe("");
    expect(result.current.view).toMatchObject({ view: "compose", failure: { kind: "server" } });
  });

  it("asks the clarifying question, then sends the answer linked to it", async () => {
    submitFeatureRequest
      .mockResolvedValueOnce({ verdict: "needs_clarification", submission_id: SUBMISSION_ID, question: "Which zone?" })
      .mockResolvedValueOnce({ verdict: "duplicate", story: PUBLIC_STORY, nuance_note: "East side", voted: true });
    const { result } = renderSubmit();
    act(() => result.current.setText("Better fishing spots please"));
    act(() => result.current.send({}));
    await waitFor(() => expect(result.current.view.view).toBe("clarify"));
    act(() => result.current.answer("Stranglethorn", {}));
    await waitFor(() => expect(result.current.view.view).toBe("duplicate"));
    expect(submitFeatureRequest.mock.calls[1][0]).toMatchObject({
      parent_submission_id: SUBMISSION_ID,
      clarification_answer: "Stranglethorn",
    });
  });

  it("keeps the text after a rejection", async () => {
    submitFeatureRequest.mockResolvedValue({ verdict: "rejected" });
    const { result } = renderSubmit();
    act(() => result.current.setText("Something off topic entirely"));
    act(() => result.current.send({}));
    await waitFor(() => expect(result.current.view).toMatchObject({ failure: { kind: "rejected" } }));
    expect(result.current.text).toBe("Something off topic entirely");
  });

  it("blocks sending until Retry-After passes on a 429", async () => {
    submitFeatureRequest.mockRejectedValue({ response: { status: 429, data: {}, headers: { "retry-after": "600" } } });
    const { result } = renderSubmit();
    act(() => result.current.setText("A route to level Alchemy cheaply"));
    const sentAt = Date.now();
    act(() => result.current.send({}));
    await waitFor(() => expect(result.current.blockedUntil).not.toBeNull());
    expect(result.current.blockedUntil ?? 0).toBeGreaterThanOrEqual(sentAt + 600_000);
  });

  it("shows nothing when the player cancels", async () => {
    submitFeatureRequest.mockImplementation(
      (_body: unknown, _token: string, signal: AbortSignal) =>
        new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("canceled")))),
    );
    const { result } = renderSubmit();
    act(() => result.current.setText("A route to level Alchemy cheaply"));
    act(() => result.current.send({}));
    act(() => result.current.cancel());
    await waitFor(() => expect(result.current.submittingSince).toBeNull());
    expect(result.current.view).toEqual({ view: "compose", failure: null, correcting: false });
  });

  it("goes back to the same text with a hint after 'That's not what I meant'", async () => {
    submitFeatureRequest.mockResolvedValue({
      verdict: "new",
      submission_id: SUBMISSION_ID,
      story: { ...STORY_TEXT, status: "submitted" },
    });
    const { result } = renderSubmit();
    act(() => result.current.setText("A route to level Alchemy cheaply"));
    act(() => result.current.send({}));
    await waitFor(() => expect(result.current.view.view).toBe("new"));
    act(() => result.current.correct());
    expect(result.current.view).toEqual({ view: "compose", failure: null, correcting: true });
    expect(result.current.text).toBe("A route to level Alchemy cheaply");
  });
});

describe("useMyIdeas", () => {
  it("lists a new idea as pending until the public board returns it", () => {
    const { result, rerender } = renderHook(({ stories }: { stories: PublicStory[] }) => useMyIdeas(stories), {
      initialProps: { stories: [] as PublicStory[] },
    });
    act(() => result.current.add(STORY_ID, "Alchemy leveling route"));
    expect(result.current.pending.map((i) => i.id)).toEqual([STORY_ID]);
    rerender({ stories: [PUBLIC_STORY] });
    expect(result.current.pending).toEqual([]);
    expect(result.current.mine.has(STORY_ID)).toBe(true);
  });
});

describe("useAboutYou", () => {
  it("starts empty with no saved player", () => {
    const { result } = renderHook(() => useAboutYou());
    expect(result.current.context).toEqual({});
    expect(result.current.summary).toBe("");
  });

  it("prefills from the saved player and says so, until something is changed", () => {
    window.localStorage.setItem(PLAYER_SETTINGS_STORAGE_KEY, JSON.stringify({ faction: "A", classId: "warlock", level: 25 }));
    const { result } = renderHook(() => useAboutYou());
    expect(result.current.summary).toMatch(/^Using your saved Warlock/);
    act(() => result.current.update({ experience: "new" }));
    expect(result.current.summary).not.toMatch(/^Using your saved/);
    act(() => result.current.clear());
    expect(result.current.context).toEqual({});
  });
});
