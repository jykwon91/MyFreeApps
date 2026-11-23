import { configureStore } from "@reduxjs/toolkit";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { baseApi } from "@platform/core/store/baseApi";
import { PRACTICE_COPY } from "@mylanguagetutor/api-client/constants/practiceCopy";
import { CONNECTION_LOST } from "@mylanguagetutor/api-client/constants/turnFailureCodes";
import { TURN_STREAM_IDLE_TIMEOUT_MS } from "@mylanguagetutor/api-client/constants/turnRequest";
import { SESSION_BLOCK_COPY } from "@mylanguagetutor/api-client/constants/sessionBlockCopy";
import { usageApiUtil } from "@mylanguagetutor/api-client/store/usageApi";
import { turnErrorCopy } from "@mylanguagetutor/api-client/utils/turnErrorCopy";
import type { Language } from "@mylanguagetutor/api-client/types/catalog/language";
import type { Scenario } from "@mylanguagetutor/api-client/types/catalog/scenario";
import PracticeSession from "@/features/session/PracticeSession";

/** Whether GET /usage/today says the tutor is on: a test flips it to see the screen follow. */
const server = vi.hoisted(() => ({ tutorAvailable: true }));

// The real conversation hook, store and turn stream, with only the server faked under them: the
// API client's requests here, and the browser's fetch for the turn stream below.
vi.mock("@platform/core/store/baseQuery", () => ({
  axiosBaseQuery: async ({ url, method }: { url: string; method: string }) => {
    if (url === "/sessions" && method === "POST") {
      return {
        data: {
          id: "conversation-1",
          language_code: "es",
          scenario_slug: "cafe",
          level: "beginner",
          status: "active",
          turn_count: 0,
          created_at: "2026-11-12T00:00:00Z",
          updated_at: "2026-11-12T00:00:00Z",
          ended_at: null,
        },
      };
    }
    if (url === "/usage/today") {
      return { data: { remaining_fraction: 1, cap_reached: false, tutor_available: server.tutorAvailable, session_limit_reached: false } };
    }
    return { error: { status: 404, data: {} } };
  },
}));

const LANGUAGE: Language = { code: "es", display_name: "Spanish", dialect_label: "Latin American", stt_locale: "es-MX", tts_locale: "es-MX" };
/** The screen's own text, not the screen reader's copy of it in the live region. */
const SHOWN = { ignore: '[data-testid="practice-announcer"], [data-testid="practice-announcer"] *' };
const SCENARIO: Scenario = { slug: "cafe", title: "At the café", goal: "Order a drink", goals: ["Greet", "Order"], order: 4 };

/** A turn stream that sends the whole reply, then loses the connection before the corrections. */
function replyThenDrop(): Response {
  const encoder = new TextEncoder();
  const events = ['event: reply.delta\ndata: {"text":"¡Hola! ¿Qué quieres?"}\n\n', "event: reply.done\ndata: {}\n\n"];
  // One event per read, then the break: erroring a stream drops whatever it still holds unread.
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      const event = events.shift();
      if (event) controller.enqueue(encoder.encode(event));
      else controller.error(new TypeError("network error"));
    },
  });
  return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

/** A turn stream that sends the first words, then goes quiet without closing, as a phone changing networks does. */
function wordsThenSilence(): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('event: reply.delta\ndata: {"text":"¡Hola! Bien"}\n\n'));
    },
  });
  return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

/** A whole turn: reply, corrections, done. */
function wholeTurn(): Response {
  const events = [
    'event: reply.delta\ndata: {"text":"¡Hola! Bienvenido."}\n\n',
    "event: reply.done\ndata: {}\n\n",
    'event: corrections\ndata: {"items":[],"retry_prompt":null,"translation":null,"scenario_state":{"goals_met":[],"complete":false}}\n\n',
    'event: done\ndata: {"status":"complete","usage":{"remaining_fraction":0.5}}\n\n',
  ];
  return new Response(events.join(""), { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

/** A turn the server refuses before it starts, as ``app/api/turns.py`` does. */
function refused(status: number, detail: string): Response {
  return new Response(JSON.stringify({ detail }), { status, headers: { "Content-Type": "application/json" } });
}

/** Renders the practice screen on a fresh store and sends one typed turn; returns the store. */
function sendTypedTurn() {
  const store = configureStore({
    reducer: { [baseApi.reducerPath]: baseApi.reducer },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(baseApi.middleware),
  });
  render(
    <Provider store={store}>
      <MemoryRouter>
        <PracticeSession language={LANGUAGE} scenario={SCENARIO} level="beginner" />
      </MemoryRouter>
    </Provider>,
  );
  fireEvent.change(screen.getByLabelText(PRACTICE_COPY.typingOnlyLabel), { target: { value: "hola" } });
  fireEvent.click(screen.getByRole("button", { name: PRACTICE_COPY.send }));
  return store;
}

/** A stand-in for the browser's utterance: records what it was asked to say and how fast. */
class FakeUtterance {
  lang = "";
  rate = 1;
  voice: unknown = null;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public text: string) {}
}

describe("PracticeSession with the real conversation hook", () => {
  beforeEach(() => {
    localStorage.setItem("token", "test-token");
    vi.stubGlobal("fetch", vi.fn(async () => replyThenDrop()));
  });

  afterEach(() => {
    // Unmount first: the speech hook cancels speech on unmount, so its globals must still be there.
    cleanup();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("keeps the reply, notes the missing suggestions, and offers nothing to resend", async () => {
    sendTypedTurn();

    expect(await screen.findByText(PRACTICE_COPY.correctionsMissing)).toBeInTheDocument();
    expect(screen.getByText("¡Hola! ¿Qué quieres?", SHOWN)).toBeInTheDocument();
    expect(screen.getByTestId("practice-announcer")).toHaveTextContent(/^¡Hola! ¿Qué quieres\?$/);
    expect(screen.queryByText(PRACTICE_COPY.replyCutOff)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: PRACTICE_COPY.tryAgain })).not.toBeInTheDocument();
    expect(await screen.findByRole("button", { name: PRACTICE_COPY.send })).toBeInTheDocument();
  });

  it("speaks every streamed sentence at the normal rate", async () => {
    const spoken: FakeUtterance[] = [];
    vi.stubGlobal("SpeechSynthesisUtterance", FakeUtterance);
    vi.stubGlobal("speechSynthesis", {
      speak: (utterance: FakeUtterance) => spoken.push(utterance),
      cancel: () => {},
      getVoices: () => [],
      addEventListener: () => {},
      removeEventListener: () => {},
    });

    sendTypedTurn();

    expect(await screen.findByText(PRACTICE_COPY.correctionsMissing)).toBeInTheDocument();
    expect(spoken.map((u) => [u.text, u.rate])).toEqual([
      ["¡Hola!", 1],
      ["¿Qué quieres?", 1],
    ]);
  });
});

describe("PracticeSession when the turn's connection goes quiet", () => {
  beforeEach(() => {
    localStorage.setItem("token", "test-token");
    // Real time keeps passing, so the screen's own waits still settle; the test jumps the stall limit.
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("says the connection dropped, keeps the words so far, and Try again sends the same words", async () => {
    const turns: string[] = [];
    const answers = [wordsThenSilence, wholeTurn];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        turns.push((JSON.parse(String(init.body)) as { text: string }).text);
        return answers[turns.length - 1]();
      }),
    );

    sendTypedTurn();
    expect(await screen.findByText("¡Hola! Bien", { ...SHOWN, exact: false })).toBeInTheDocument();
    expect(screen.queryByText(turnErrorCopy(CONNECTION_LOST), SHOWN)).not.toBeInTheDocument();

    await act(() => vi.advanceTimersByTimeAsync(TURN_STREAM_IDLE_TIMEOUT_MS));
    expect(await screen.findByText(turnErrorCopy(CONNECTION_LOST), SHOWN)).toBeInTheDocument();
    expect(screen.getByText(PRACTICE_COPY.replyCutOff, SHOWN)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: PRACTICE_COPY.tryAgain }));
    expect(await screen.findByText("¡Hola! Bienvenido.", SHOWN)).toBeInTheDocument();
    expect(screen.queryByText(turnErrorCopy(CONNECTION_LOST), SHOWN)).not.toBeInTheDocument();
    expect(screen.queryByText(PRACTICE_COPY.replyCutOff)).not.toBeInTheDocument();
    expect(turns).toEqual(["hola", "hola"]);
  });
});

describe("PracticeSession when the server refuses a turn that can't be answered now", () => {
  beforeEach(() => {
    localStorage.setItem("token", "test-token");
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    localStorage.clear();
    server.tutorAvailable = true;
  });

  it("keeps the learner's words when the tutor is unavailable, and Try again sends them once the tutor is back", async () => {
    const turns: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        turns.push((JSON.parse(String(init.body)) as { text: string }).text);
        return turns.length === 1 ? refused(503, "tutor_unavailable") : wholeTurn();
      }),
    );
    // The server's shared budget is spent: usage asked after the refusal says so too.
    server.tutorAvailable = false;

    const store = sendTypedTurn();

    expect(await screen.findByText(turnErrorCopy("tutor_unavailable"), SHOWN)).toBeInTheDocument();
    expect(screen.getByText(SESSION_BLOCK_COPY.unavailable, SHOWN)).toBeInTheDocument();
    expect(screen.getByText("hola")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: PRACTICE_COPY.tryAgain })).not.toBeInTheDocument();

    server.tutorAvailable = true;
    act(() => {
      store.dispatch(usageApiUtil.invalidateTags(["Usage"]));
    });

    fireEvent.click(await screen.findByRole("button", { name: PRACTICE_COPY.tryAgain }));
    expect(await screen.findByText("¡Hola! Bienvenido.", SHOWN)).toBeInTheDocument();
    expect(screen.queryByText(SESSION_BLOCK_COPY.unavailable, SHOWN)).not.toBeInTheDocument();
    expect(screen.getAllByText("hola")).toHaveLength(1);
    expect(turns).toEqual(["hola", "hola"]);
  });

  it("keeps the learner's words when the conversation has ended, and points to another scenario", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => refused(409, "session_ended")));

    sendTypedTurn();

    expect(await screen.findByText(SESSION_BLOCK_COPY.session_ended, SHOWN)).toBeInTheDocument();
    expect(screen.getByText("hola")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: PRACTICE_COPY.pickScenario })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: PRACTICE_COPY.tryAgain })).not.toBeInTheDocument();
  });
});
