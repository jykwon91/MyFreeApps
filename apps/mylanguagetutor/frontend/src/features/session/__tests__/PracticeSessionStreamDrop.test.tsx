import { configureStore } from "@reduxjs/toolkit";
import { fireEvent, render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { baseApi } from "@platform/core/store/baseApi";
import { PRACTICE_COPY } from "@mylanguagetutor/api-client/constants/practiceCopy";
import type { Language } from "@mylanguagetutor/api-client/types/catalog/language";
import type { Scenario } from "@mylanguagetutor/api-client/types/catalog/scenario";
import PracticeSession from "@/features/session/PracticeSession";

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
    if (url === "/usage/today") return { data: { remaining_fraction: 1, cap_reached: false, tutor_available: true } };
    return { error: { status: 404, data: {} } };
  },
}));

const LANGUAGE: Language = { code: "es", display_name: "Spanish", dialect_label: "Latin American", stt_locale: "es-MX", tts_locale: "es-MX" };
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

describe("PracticeSession when the stream drops after the whole reply", () => {
  beforeEach(() => {
    localStorage.setItem("token", "test-token");
    vi.stubGlobal("fetch", vi.fn(async () => replyThenDrop()));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("keeps the reply, notes the missing suggestions, and offers nothing to resend", async () => {
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

    expect(await screen.findByText(PRACTICE_COPY.correctionsMissing)).toBeInTheDocument();
    expect(screen.getByText("¡Hola! ¿Qué quieres?")).toBeInTheDocument();
    expect(screen.queryByText(PRACTICE_COPY.replyCutOff)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: PRACTICE_COPY.tryAgain })).not.toBeInTheDocument();
    expect(await screen.findByRole("button", { name: PRACTICE_COPY.send })).toBeInTheDocument();
  });
});
