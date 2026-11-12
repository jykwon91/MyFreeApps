import { PRACTICE_COPY } from "@mylanguagetutor/api-client/constants/practiceCopy";
import { SESSION_BLOCK_COPY } from "@mylanguagetutor/api-client/constants/sessionBlockCopy";
import { CONNECTION_LOST, NETWORK_ERROR, SESSION_NOT_FOUND } from "@mylanguagetutor/api-client/constants/turnFailureCodes";
import { practicePath } from "@mylanguagetutor/api-client/utils/practicePath";
import { turnErrorCopy } from "@mylanguagetutor/api-client/utils/turnErrorCopy";
import { baseApi } from "@platform/core/store/baseApi";
import { serve } from "@platform/mobile/test-support/fakeServer";
import { storedItems } from "@platform/mobile/test-support/memorySecureStore";
import { storeSession, tokens } from "@platform/mobile/test-support/storedSession";
import type { FakeRoute } from "@platform/mobile/test-support/types/FakeRoute";
import type { SentRequest } from "@platform/mobile/test-support/types/SentRequest";
import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { router } from "expo-router";
import { AccessibilityInfo, AppState, ScrollView } from "react-native";
import type { AppStateStatus } from "react-native";
import { CORRECTIONS_GRACE_MS, KEEP_AWAKE_IDLE_MS, SCENARIO_COMPLETE_MESSAGE } from "../src/constants/conversation";
import { store } from "../src/lib/store";
import { serveTurns, turnStream } from "../test-support/fakeExpoFetch";
import { ONBOARDED_LEARNER_ROUTES, PRACTICE_HEADING } from "../test-support/onboardedLearner";
import { renderApp } from "../test-support/renderApp";
import { CORRECTION, TUTOR_SESSION, USAGE_LEFT, USAGE_USED_UP } from "../test-support/tutorRecords";
import type { FakeTurnStream } from "../test-support/types/FakeTurnStream";

const mockKeepAwake = { active: 0 };

jest.mock("expo-secure-store", () => jest.requireActual("@platform/mobile/test-support/memorySecureStore"));
jest.mock("expo-application", () => jest.requireActual("@platform/mobile/test-support/fakeApplication"));
jest.mock("expo-device", () => ({ deviceName: "Test Phone", modelName: "iPhone" }));
jest.mock("react-native-safe-area-context", () => jest.requireActual("react-native-safe-area-context/jest/mock").default);
jest.mock("expo/fetch", () => jest.requireActual("../test-support/fakeExpoFetch"));
jest.mock("expo-keep-awake", () => {
  const { useEffect } = jest.requireActual<typeof import("react")>("react");
  return {
    useKeepAwake: () =>
      useEffect(() => {
        mockKeepAwake.active += 1;
        return () => {
          mockKeepAwake.active -= 1;
        };
      }, []),
  };
});

const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibilityWithOptions");
let refreshes = 0;

/** A learner who has onboarded, with a conversation the server opens on the first turn, plus any overrides. */
function serveConversation(overrides: Record<string, FakeRoute> = {}): SentRequest[] {
  return serve({
    "POST /auth/mobile/refresh": () => {
      refreshes += 1;
      return { status: 200, data: tokens(refreshes) };
    },
    ...ONBOARDED_LEARNER_ROUTES,
    "POST /sessions": () => ({ status: 201, data: TUTOR_SESSION }),
    ...overrides,
  });
}

/** Tells every listener the app moved to `state`, as the phone does when the learner leaves or comes back. */
async function moveApp(state: AppStateStatus): Promise<void> {
  const listeners = jest
    .mocked(AppState.addEventListener)
    .mock.calls.flatMap(([type, listener]) => (type === "change" ? [listener as (next: AppStateStatus) => void] : []));
  await act(async () => listeners.forEach((listener) => listener(state)));
}

async function openCafe(): Promise<void> {
  await renderApp(practicePath("cafe"));
  expect(await screen.findByRole("header", { name: "At the cafe" })).toBeTruthy();
}

async function write(text: string): Promise<void> {
  await fireEvent.changeText(screen.getByLabelText(PRACTICE_COPY.typingOnlyLabel), text);
  await fireEvent.press(screen.getByRole("button", { name: PRACTICE_COPY.send }));
}

/** The server writes to a reply the screen is reading. */
async function serverWrites(writeReply: () => void): Promise<void> {
  await act(async () => writeReply());
}

/** The rest of a reply after its first words: the end, the corrections, and done. */
async function finish(stream: FakeTurnStream, { complete = false } = {}): Promise<void> {
  await serverWrites(() => stream.emit("reply.done", {}));
  await finishAfterReply(stream, { complete });
}

/** What follows a whole reply: the corrections, and done. */
async function finishAfterReply(stream: FakeTurnStream, { complete = false } = {}): Promise<void> {
  await serverWrites(() => {
    stream.emit("corrections", {
      items: [CORRECTION],
      retry_prompt: "Try saying: Quiero un café.",
      scenario_state: { goals_met: complete ? [0] : [], complete },
      translation: "Hi! What would you like?",
    });
    stream.emit("done", { status: "complete", usage: { remaining_fraction: 0.5 } });
    stream.close();
  });
}

beforeEach(() => {
  storedItems.clear();
  storeSession();
  announce.mockClear();
  store.dispatch(baseApi.util.resetApiState());
});

describe("a typed conversation", () => {
  it("shows the reply as it streams, then the corrections, and reads the finished reply out", async () => {
    const sent = serveConversation();
    const stream = turnStream();
    const turns = serveTurns(() => ({ stream }));
    await openCafe();
    expect(screen.getByText("Say hello in Spanish to start the conversation.")).toBeTruthy();
    expect(mockKeepAwake.active).toBe(1);

    await write("Quiero un cafe");
    expect(screen.getByText("Quiero un cafe")).toBeTruthy();
    expect(screen.getByLabelText(PRACTICE_COPY.tutorThinking)).toBeTruthy();
    expect(screen.getByRole("button", { name: PRACTICE_COPY.sending })).toBeDisabled();

    await serverWrites(() => stream.emit("reply.delta", { text: "¡Hola! " }));
    expect(screen.getByText("¡Hola!")).toBeTruthy();
    expect(screen.queryByLabelText(PRACTICE_COPY.tutorThinking)).toBeNull();
    await serverWrites(() => stream.emit("reply.delta", { text: "¿Qué quieres?" }));
    expect(screen.getByText("¡Hola! ¿Qué quieres?")).toBeTruthy();
    expect(announce).not.toHaveBeenCalledWith("¡Hola! ¿Qué quieres?", { queue: true });

    await finish(stream);
    expect(await screen.findByRole("button", { name: PRACTICE_COPY.send })).toBeTruthy();
    expect(screen.getByText(/It looked like you said/)).toHaveTextContent('It looked like you said "un cafe" — natural Spanish: "un café"');
    expect(screen.getByText(CORRECTION.explanation)).toBeTruthy();
    expect(screen.getByText("Try saying: Quiero un café.")).toBeTruthy();
    expect(announce).toHaveBeenCalledWith("¡Hola! ¿Qué quieres?", { queue: true });

    expect(screen.queryByText("Hi! What would you like?")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: PRACTICE_COPY.showTranslation }));
    expect(screen.getByText("Hi! What would you like?")).toBeTruthy();

    expect(turns).toEqual([{ path: `/sessions/${TUTOR_SESSION.id}/turns`, authorization: "Bearer a1", text: "Quiero un cafe" }]);
    expect(sent.find((request) => request.route === "POST /sessions")?.body).toEqual({
      language_code: "es",
      scenario_slug: "cafe",
      level: "some_phrases",
    });
  });

  it("says up front when today's practice is used up", async () => {
    serveConversation({ "GET /usage/today": () => ({ status: 200, data: USAGE_USED_UP }) });
    serveTurns(() => ({ status: 429, data: { detail: "daily_limit_reached" } }));
    await openCafe();

    expect(await screen.findByText(SESSION_BLOCK_COPY.daily_limit)).toBeTruthy();
    expect(screen.queryByRole("button", { name: PRACTICE_COPY.send })).toBeNull();
    expect(screen.queryByRole("button", { name: PRACTICE_COPY.pickScenario })).toBeNull();
  });

  it("stops the learner when the server refuses a turn for today's limit", async () => {
    serveConversation();
    serveTurns(() => ({ status: 429, data: { detail: "daily_limit_reached" } }));
    await openCafe();

    await write("Hola");
    expect(await screen.findByText(SESSION_BLOCK_COPY.daily_limit)).toBeTruthy();
    expect(screen.queryByRole("button", { name: PRACTICE_COPY.send })).toBeNull();
    expect(screen.queryByText("Hola")).toBeNull();
  });

  it("says when the last message is still being answered, and sends it again", async () => {
    serveConversation();
    const stream = turnStream();
    let isBusy = true;
    const turns = serveTurns(() => (isBusy ? { status: 429, data: { detail: "turn_in_progress" } } : { stream }));
    await openCafe();

    await write("Hola");
    expect(await screen.findByText(turnErrorCopy("turn_in_progress"))).toBeTruthy();
    isBusy = false;
    await fireEvent.press(screen.getByRole("button", { name: PRACTICE_COPY.tryAgain }));
    await serverWrites(() => stream.emit("reply.delta", { text: "¡Hola!" }));
    await finish(stream);
    expect(screen.getByText("¡Hola!")).toBeTruthy();
    expect(screen.queryByText(turnErrorCopy("turn_in_progress"))).toBeNull();
    expect(turns.map((turn) => turn.text)).toEqual(["Hola", "Hola"]);
  });

  it("says when the connection is down, and sends the same words again", async () => {
    serveConversation();
    const stream = turnStream();
    let isDown = true;
    const turns = serveTurns(() => (isDown ? { unreachable: true } : { stream }));
    await openCafe();

    await write("Hola");
    expect(await screen.findByText(turnErrorCopy(NETWORK_ERROR))).toBeTruthy();
    expect(screen.queryByText("Hola")).toBeNull();

    isDown = false;
    await fireEvent.press(screen.getByRole("button", { name: PRACTICE_COPY.tryAgain }));
    await serverWrites(() => stream.emit("reply.delta", { text: "¡Hola!" }));
    await finish(stream);
    expect(screen.getByText("Hola")).toBeTruthy();
    expect(screen.getByText("¡Hola!")).toBeTruthy();
    expect(screen.queryByText(turnErrorCopy(NETWORK_ERROR))).toBeNull();
    expect(turns.map((turn) => turn.text)).toEqual(["Hola", "Hola"]);
  });

  it("stops the reply when the app goes to the background, keeps what arrived, and tries again on return", async () => {
    serveConversation();
    const streams = [turnStream(), turnStream()];
    let turn = 0;
    serveTurns(() => ({ stream: streams[turn++] }));
    await openCafe();

    await write("Hola");
    await serverWrites(() => streams[0].emit("reply.delta", { text: "¡Hola! Bienvenido" }));
    await moveApp("background");
    expect(streams[0].isAborted()).toBe(true);
    await moveApp("active");

    expect(await screen.findByText(turnErrorCopy(CONNECTION_LOST))).toBeTruthy();
    expect(screen.getByText("¡Hola! Bienvenido …")).toBeTruthy();
    expect(screen.getByText(PRACTICE_COPY.replyCutOff)).toBeTruthy();
    expect(screen.queryByRole("button", { name: PRACTICE_COPY.sending })).toBeNull();

    await fireEvent.press(screen.getByRole("button", { name: PRACTICE_COPY.tryAgain }));
    await serverWrites(() => streams[1].emit("reply.delta", { text: "¡Hola! Bienvenido al café." }));
    await finish(streams[1]);
    expect(screen.getByText("¡Hola! Bienvenido al café.")).toBeTruthy();
    expect(screen.queryByText(PRACTICE_COPY.replyCutOff)).toBeNull();
    expect(screen.queryByText(turnErrorCopy(CONNECTION_LOST))).toBeNull();
    expect(screen.getAllByText("Hola")).toHaveLength(1);
  });

  it("stops the reply when the learner leaves the conversation", async () => {
    serveConversation();
    const stream = turnStream();
    serveTurns(() => ({ stream }));
    await openCafe();

    await write("Hola");
    await serverWrites(() => stream.emit("reply.delta", { text: "¡Hola!" }));
    await act(async () => router.back());

    expect(await screen.findByRole("header", { name: PRACTICE_HEADING })).toBeTruthy();
    expect(stream.isAborted()).toBe(true);
    expect(mockKeepAwake.active).toBe(0);
  });

  it("ends the scenario once its goals are covered, and moves on to the next one", async () => {
    serveConversation();
    const stream = turnStream();
    serveTurns(() => ({ stream }));
    await openCafe();

    await write("Quiero un cafe");
    await serverWrites(() => stream.emit("reply.delta", { text: "¡Claro!" }));
    await finish(stream, { complete: true });
    expect(await screen.findByText(SCENARIO_COMPLETE_MESSAGE)).toBeTruthy();
    expect(screen.getByLabelText(`Order ${PRACTICE_COPY.goalDone}`)).toBeTruthy();

    await fireEvent.press(screen.getByRole("button", { name: PRACTICE_COPY.keepTalking }));
    expect(screen.queryByText(SCENARIO_COMPLETE_MESSAGE)).toBeNull();
    expect(screen.getByRole("button", { name: PRACTICE_COPY.send })).toBeTruthy();
  });

  it("goes back to the scenarios from a finished scenario", async () => {
    serveConversation();
    const stream = turnStream();
    serveTurns(() => ({ stream }));
    await openCafe();

    await write("Quiero un cafe");
    await finish(stream, { complete: true });
    await fireEvent.press(await screen.findByRole("button", { name: PRACTICE_COPY.nextScenario }));

    expect(await screen.findByRole("header", { name: PRACTICE_HEADING })).toBeTruthy();
    expect(screen).toHavePathname("/");
    expect(router.canGoBack()).toBe(false);
  });

  it("says when the conversation has ended, and offers another scenario", async () => {
    serveConversation();
    serveTurns(() => ({ status: 409, data: { detail: "session_ended" } }));
    await openCafe();

    await write("Hola");
    expect(await screen.findByText(SESSION_BLOCK_COPY.session_ended)).toBeTruthy();
    expect(screen.queryByRole("button", { name: PRACTICE_COPY.send })).toBeNull();
    expect(mockKeepAwake.active).toBe(0);

    await fireEvent.press(screen.getByRole("button", { name: PRACTICE_COPY.pickScenario }));
    expect(await screen.findByRole("header", { name: PRACTICE_HEADING })).toBeTruthy();
  });

  it("says when the scenario doesn't exist, and goes to the list", async () => {
    serveConversation();
    await renderApp(practicePath("moon-landing"));

    expect(await screen.findByRole("header", { name: PRACTICE_COPY.scenarioNotFound })).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: PRACTICE_COPY.seeScenarios }));
    expect(await screen.findByRole("header", { name: PRACTICE_HEADING })).toBeTruthy();
  });

  it("goes to the scenarios when no scenario is named", async () => {
    serveConversation();
    await renderApp("/practice");

    expect(await screen.findByRole("header", { name: PRACTICE_HEADING })).toBeTruthy();
    expect(screen).toHavePathname("/");
  });

  it("renews the sign-in once when a turn is refused it, then sends the turn", async () => {
    serveConversation();
    const stream = turnStream();
    let isSignInStale = true;
    const turns = serveTurns(() => {
      if (!isSignInStale) return { stream };
      isSignInStale = false;
      return { status: 401, data: { detail: "Unauthorized" } };
    });
    await openCafe();
    const before = refreshes;

    await write("Hola");
    await serverWrites(() => stream.emit("reply.delta", { text: "¡Hola!" }));
    await finish(stream);

    expect(screen.getByText("¡Hola!")).toBeTruthy();
    expect(refreshes).toBe(before + 1);
    expect(turns.map((turn) => turn.authorization)).toEqual([`Bearer a${before}`, `Bearer a${before + 1}`]);
    expect(screen).toHavePathname("/practice");
  });

  it("says up front when the tutor is unavailable", async () => {
    serveConversation({ "GET /usage/today": () => ({ status: 200, data: { ...USAGE_LEFT, tutor_available: false } }) });
    await openCafe();

    expect(await screen.findByText(SESSION_BLOCK_COPY.unavailable)).toBeTruthy();
    expect(screen.queryByRole("button", { name: PRACTICE_COPY.send })).toBeNull();
    expect(screen.queryByRole("button", { name: PRACTICE_COPY.pickScenario })).toBeNull();
  });

  it("stops the learner when the server says the tutor is unavailable", async () => {
    serveConversation();
    serveTurns(() => ({ status: 503, data: { detail: "tutor_unavailable" } }));
    await openCafe();

    await write("Hola");
    expect(await screen.findByText(SESSION_BLOCK_COPY.unavailable)).toBeTruthy();
    expect(screen.queryByRole("button", { name: PRACTICE_COPY.send })).toBeNull();
  });

  it("says when the conversation has reached its length limit, and offers another scenario", async () => {
    serveConversation();
    serveTurns(() => ({ status: 409, data: { detail: "session_turn_limit" } }));
    await openCafe();

    await write("Hola");
    expect(await screen.findByText(SESSION_BLOCK_COPY.session_limit)).toBeTruthy();
    expect(screen.queryByRole("button", { name: PRACTICE_COPY.send })).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: PRACTICE_COPY.pickScenario }));
    expect(await screen.findByRole("header", { name: PRACTICE_HEADING })).toBeTruthy();
  });

  it("keeps what arrived when the tutor fails mid-reply, and sends the same words again", async () => {
    serveConversation();
    const streams = [turnStream(), turnStream()];
    let turn = 0;
    const turns = serveTurns(() => ({ stream: streams[turn++] }));
    await openCafe();

    await write("Hola");
    await serverWrites(() => {
      streams[0].emit("reply.delta", { text: "¡Hola! Bien" });
      streams[0].emit("error", { code: "tutor_busy", retryable: true });
      streams[0].emit("done", { status: "partial", usage: { remaining_fraction: 0.5 } });
      streams[0].close();
    });
    expect(await screen.findByText(turnErrorCopy("tutor_busy"))).toBeTruthy();
    expect(screen.getByText("¡Hola! Bien …")).toBeTruthy();

    await fireEvent.press(screen.getByRole("button", { name: PRACTICE_COPY.tryAgain }));
    await serverWrites(() => streams[1].emit("reply.delta", { text: "¡Hola! Bienvenido." }));
    await finish(streams[1]);
    expect(screen.getByText("¡Hola! Bienvenido.")).toBeTruthy();
    expect(screen.queryByText(turnErrorCopy("tutor_busy"))).toBeNull();
    expect(turns.map((sent) => sent.text)).toEqual(["Hola", "Hola"]);
  });

  it("starts a new conversation when the server no longer has this one", async () => {
    const sent = serveConversation();
    const stream = turnStream();
    let isGone = true;
    serveTurns(() => {
      if (!isGone) return { stream };
      isGone = false;
      return { status: 404, data: { detail: SESSION_NOT_FOUND } };
    });
    await openCafe();

    await write("Hola");
    expect(await screen.findByText(turnErrorCopy(SESSION_NOT_FOUND))).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: PRACTICE_COPY.tryAgain }));
    await serverWrites(() => stream.emit("reply.delta", { text: "¡Hola!" }));
    await finish(stream);

    expect(screen.getByText("¡Hola!")).toBeTruthy();
    expect(sent.filter((request) => request.route === "POST /sessions")).toHaveLength(2);
  });

  it("sends one turn when the keyboard's send key and the Send button both fire", async () => {
    serveConversation();
    const stream = turnStream();
    const turns = serveTurns(() => ({ stream }));
    await openCafe();

    const field = screen.getByLabelText(PRACTICE_COPY.typingOnlyLabel);
    await fireEvent.changeText(field, "Hola");
    const sendButton = screen.getByRole("button", { name: PRACTICE_COPY.send });
    await act(async () => {
      void fireEvent(field, "submitEditing");
      void fireEvent.press(sendButton);
    });
    await serverWrites(() => stream.emit("reply.delta", { text: "¡Hola!" }));
    await finish(stream);

    expect(turns).toHaveLength(1);
    expect(screen.getAllByText("Hola")).toHaveLength(1);
  });

  it("lets a reply that has fully arrived finish when the app goes to the background", async () => {
    serveConversation();
    const stream = turnStream();
    serveTurns(() => ({ stream }));
    await openCafe();

    await write("Quiero un cafe");
    await serverWrites(() => {
      stream.emit("reply.delta", { text: "¡Hola!" });
      stream.emit("reply.done", {});
    });
    await moveApp("background");
    expect(stream.isAborted()).toBe(false);
    await finishAfterReply(stream);
    await moveApp("active");

    expect(await screen.findByText(CORRECTION.explanation)).toBeTruthy();
    expect(screen.queryByText(PRACTICE_COPY.replyCutOff)).toBeNull();
    expect(screen.queryByRole("button", { name: PRACTICE_COPY.tryAgain })).toBeNull();
  });

  it("stops waiting for a whole reply's corrections a moment after the app comes back", async () => {
    serveConversation();
    const stream = turnStream();
    serveTurns(() => ({ stream }));
    await openCafe();

    await write("Hola");
    await serverWrites(() => {
      stream.emit("reply.delta", { text: "¡Hola!" });
      stream.emit("reply.done", {});
    });
    // The phone dropped the connection while asleep without telling the screen: nothing more arrives.
    await moveApp("background");
    await moveApp("active");
    await act(async () => jest.advanceTimersByTime(CORRECTIONS_GRACE_MS - 1));
    expect(screen.getByRole("button", { name: PRACTICE_COPY.sending })).toBeDisabled();
    expect(stream.isAborted()).toBe(false);

    await act(async () => jest.advanceTimersByTime(1));
    expect(await screen.findByText(PRACTICE_COPY.correctionsMissing)).toBeTruthy();
    expect(stream.isAborted()).toBe(true);
    expect(screen.getByText("¡Hola!")).toBeTruthy();
    expect(screen.queryByText(PRACTICE_COPY.replyCutOff)).toBeNull();
    expect(screen.queryByRole("button", { name: PRACTICE_COPY.tryAgain })).toBeNull();
    expect(screen.getByRole("button", { name: PRACTICE_COPY.send })).toBeTruthy();
  });

  it("shows corrections that arrive soon after the app comes back", async () => {
    serveConversation();
    const stream = turnStream();
    serveTurns(() => ({ stream }));
    await openCafe();

    await write("Quiero un cafe");
    await serverWrites(() => {
      stream.emit("reply.delta", { text: "¡Hola!" });
      stream.emit("reply.done", {});
    });
    await moveApp("background");
    await moveApp("active");
    await act(async () => jest.advanceTimersByTime(CORRECTIONS_GRACE_MS - 1));
    await finishAfterReply(stream);
    await act(async () => jest.advanceTimersByTime(CORRECTIONS_GRACE_MS));

    expect(await screen.findByText(CORRECTION.explanation)).toBeTruthy();
    expect(screen.queryByText(PRACTICE_COPY.correctionsMissing)).toBeNull();
  });

  it("leaves a turn sent after the app came back alone when the grace period ends", async () => {
    serveConversation();
    const streams = [turnStream(), turnStream()];
    let turn = 0;
    serveTurns(() => ({ stream: streams[turn++] }));
    await openCafe();

    await write("Hola");
    await serverWrites(() => {
      streams[0].emit("reply.delta", { text: "¡Hola!" });
      streams[0].emit("reply.done", {});
    });
    await moveApp("background");
    await moveApp("active");
    await finishAfterReply(streams[0]);
    await write("Quiero un cafe");
    await serverWrites(() => {
      streams[1].emit("reply.delta", { text: "¡Claro!" });
      streams[1].emit("reply.done", {});
    });
    await act(async () => jest.advanceTimersByTime(CORRECTIONS_GRACE_MS));

    expect(streams[1].isAborted()).toBe(false);
    expect(screen.queryByText(PRACTICE_COPY.correctionsMissing)).toBeNull();
    expect(screen.getByRole("button", { name: PRACTICE_COPY.sending })).toBeDisabled();
    await finishAfterReply(streams[1]);
    expect(await screen.findAllByText(CORRECTION.explanation)).toHaveLength(2);
    expect(screen.queryByText(PRACTICE_COPY.correctionsMissing)).toBeNull();
  });

  it("keeps a whole reply when the connection drops before its corrections, without offering to send it again", async () => {
    serveConversation();
    const stream = turnStream();
    serveTurns(() => ({ stream }));
    await openCafe();

    await write("Hola");
    await serverWrites(() => {
      stream.emit("reply.delta", { text: "¡Hola!" });
      stream.emit("reply.done", {});
      stream.fail();
    });

    expect(await screen.findByText(PRACTICE_COPY.correctionsMissing)).toBeTruthy();
    expect(screen.getByText("¡Hola!")).toBeTruthy();
    expect(screen.queryByText(PRACTICE_COPY.replyCutOff)).toBeNull();
    expect(screen.queryByRole("button", { name: PRACTICE_COPY.tryAgain })).toBeNull();
    expect(screen.getByRole("button", { name: PRACTICE_COPY.send })).toBeTruthy();
  });

  it("stops a turn still waiting for its first words when the app goes to the background, and tries again on return", async () => {
    serveConversation();
    const stream = turnStream();
    let isFirst = true;
    const turns = serveTurns(() => {
      if (!isFirst) return { stream };
      isFirst = false;
      return new Promise<never>(() => {});
    });
    await openCafe();

    await write("Hola");
    expect(screen.getByLabelText(PRACTICE_COPY.tutorThinking)).toBeTruthy();
    await moveApp("background");
    await moveApp("active");

    expect(await screen.findByText(turnErrorCopy(CONNECTION_LOST))).toBeTruthy();
    expect(screen.queryByLabelText(PRACTICE_COPY.tutorThinking)).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: PRACTICE_COPY.tryAgain }));
    await serverWrites(() => stream.emit("reply.delta", { text: "¡Hola!" }));
    await finish(stream);
    expect(screen.getByText("¡Hola!")).toBeTruthy();
    expect(screen.getAllByText("Hola")).toHaveLength(1);
    expect(turns).toHaveLength(2);
  });

  it("keeps the newest message in view when the keyboard opens, unless the learner has scrolled up", async () => {
    serveConversation();
    const stream = turnStream();
    serveTurns(() => ({ stream }));
    await openCafe();
    await write("Hola");
    await serverWrites(() => stream.emit("reply.delta", { text: "¡Hola!" }));
    await finish(stream);
    const scrollToEnd = jest.spyOn(ScrollView.prototype, "scrollToEnd");
    const conversation = screen.getByTestId("conversation");
    const keyboardOpens = () => fireEvent(conversation, "layout", { nativeEvent: { layout: { x: 0, y: 0, width: 300, height: 300 } } });

    await keyboardOpens();
    expect(scrollToEnd).toHaveBeenCalledTimes(1);

    await fireEvent.scroll(conversation, {
      nativeEvent: {
        contentOffset: { x: 0, y: 0 },
        contentSize: { width: 300, height: 1000 },
        layoutMeasurement: { width: 300, height: 600 },
      },
    });
    await keyboardOpens();
    expect(scrollToEnd).toHaveBeenCalledTimes(1);
    scrollToEnd.mockRestore();
  });

  it("lets the screen sleep once the learner has been idle a while, and wakes it on the next keystroke", async () => {
    serveConversation();
    const stream = turnStream();
    serveTurns(() => ({ stream }));
    await openCafe();
    const field = screen.getByLabelText(PRACTICE_COPY.typingOnlyLabel);

    await write("Hola");
    await act(async () => jest.advanceTimersByTime(KEEP_AWAKE_IDLE_MS));
    expect(mockKeepAwake.active).toBe(1);
    await serverWrites(() => stream.emit("reply.delta", { text: "¡Hola!" }));
    await finish(stream);

    await act(async () => jest.advanceTimersByTime(KEEP_AWAKE_IDLE_MS - 1));
    expect(mockKeepAwake.active).toBe(1);
    await act(async () => jest.advanceTimersByTime(1));
    expect(mockKeepAwake.active).toBe(0);

    await fireEvent.changeText(field, "Q");
    expect(mockKeepAwake.active).toBe(1);
  });

  it("counts scrolling through the conversation as activity that keeps the screen awake", async () => {
    serveConversation();
    await openCafe();
    const conversation = screen.getByTestId("conversation");

    await act(async () => jest.advanceTimersByTime(KEEP_AWAKE_IDLE_MS - 1));
    await fireEvent.scroll(conversation, {
      nativeEvent: {
        contentOffset: { x: 0, y: 0 },
        contentSize: { width: 300, height: 1000 },
        layoutMeasurement: { width: 300, height: 600 },
      },
    });
    await act(async () => jest.advanceTimersByTime(KEEP_AWAKE_IDLE_MS - 1));
    expect(mockKeepAwake.active).toBe(1);
    await act(async () => jest.advanceTimersByTime(1));
    expect(mockKeepAwake.active).toBe(0);
  });

  // Last: the phone signs out, and the session is read from the phone once per file.
  it("signs out when the server refuses the sign-in and it can't be renewed", async () => {
    serveConversation({ "POST /auth/mobile/refresh": () => ({ status: 401, data: { detail: "refresh_invalid" } }) });
    serveTurns(() => ({ status: 401, data: { detail: "Unauthorized" } }));
    await openCafe();

    await write("Hola");
    await waitFor(() => expect(screen).toHavePathname("/sign-in"));
  });
});
