import { configureStore } from "@reduxjs/toolkit";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { baseApi } from "@platform/core/store/baseApi";
import { PRACTICE_COPY } from "@mylanguagetutor/api-client/constants/practiceCopy";
import { PRACTICE_NOTICE_COPY } from "@mylanguagetutor/api-client/constants/practiceNoticeCopy";
import type { Language } from "@mylanguagetutor/api-client/types/catalog/language";
import type { Scenario } from "@mylanguagetutor/api-client/types/catalog/scenario";
import PracticeSession from "@/features/session/PracticeSession";
import { SHOWN } from "@/test/shownText";

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
      return { data: { remaining_fraction: 1, cap_reached: false, tutor_available: true, session_limit_reached: false } };
    }
    return { error: { status: 404, data: {} } };
  },
}));

const LANGUAGE: Language = { code: "es", display_name: "Spanish", dialect_label: "Latin American", stt_locale: "es-MX", tts_locale: "es-MX" };
const SCENARIO: Scenario = { slug: "cafe", title: "At the café", goal: "Order a drink", goals: ["Greet", "Order"], order: 4 };

function wholeTurn(goalsMet: number[]): Response {
  const events = [
    'event: reply.delta\ndata: {"text":"¡Hola! Bienvenido."}\n\n',
    "event: reply.done\ndata: {}\n\n",
    `event: corrections\ndata: {"items":[],"retry_prompt":null,"translation":null,"scenario_state":{"goals_met":${JSON.stringify(goalsMet)},"complete":false}}\n\n`,
    'event: done\ndata: {"status":"complete","usage":{"remaining_fraction":0.5}}\n\n',
  ];
  return new Response(events.join(""), { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

function refused(status: number, detail: string): Response {
  return new Response(JSON.stringify({ detail }), { status, headers: { "Content-Type": "application/json" } });
}

function openPractice() {
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
}

function answer(text: string) {
  fireEvent.change(screen.getByLabelText(PRACTICE_COPY.typingOnlyLabel), { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: PRACTICE_COPY.send }));
}

describe("PracticeSession notices", () => {
  beforeEach(() => {
    localStorage.setItem("token", "test-token");
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("tells the learner a long answer was shortened, until they dismiss it", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => wholeTurn([])));
    openPractice();

    answer("palabra ".repeat(100));

    expect(await screen.findByText(PRACTICE_NOTICE_COPY.truncated, SHOWN)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: PRACTICE_COPY.dismiss }));
    expect(screen.queryByText(PRACTICE_NOTICE_COPY.truncated, SHOWN)).not.toBeInTheDocument();
  });

  it("tells the learner the conversation restarted, keeping what they said before", async () => {
    const answers = [() => wholeTurn([0]), () => refused(404, "session_not_found"), () => wholeTurn([])];
    let turns = 0;
    vi.stubGlobal("fetch", vi.fn(async () => answers[turns++]()));
    openPractice();

    answer("hola");
    expect(await screen.findByText("¡Hola! Bienvenido.", SHOWN)).toBeInTheDocument();
    answer("un café");
    fireEvent.click(await screen.findByRole("button", { name: PRACTICE_COPY.tryAgain }));

    expect(await screen.findByText(PRACTICE_NOTICE_COPY.restarted, SHOWN)).toBeInTheDocument();
    expect(screen.getByText("hola")).toBeInTheDocument();
    expect(screen.getByText("un café")).toBeInTheDocument();
  });
});
