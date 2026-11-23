import { PRACTICE_COPY } from "@mylanguagetutor/api-client/constants/practiceCopy";
import { RESUMED_TURN_SILENCE_MS } from "@mylanguagetutor/api-client/constants/turnRequest";
import { baseApi } from "@platform/core/store/baseApi";
import { storedItems } from "@platform/mobile/test-support/memorySecureStore";
import { storeSession } from "@platform/mobile/test-support/storedSession";
import { act, fireEvent, screen } from "@testing-library/react-native";
import { AccessibilityInfo } from "react-native";
import { store } from "../src/lib/store";
import { finish, moveApp, openCafe, serveConversation, serverWrites, write } from "../test-support/conversation";
import { serveTurns, turnStream } from "../test-support/fakeExpoFetch";
import { resetSpeech } from "../test-support/fakeSpeech";

jest.mock("expo-secure-store", () => jest.requireActual("@platform/mobile/test-support/memorySecureStore"));
jest.mock("expo-application", () => jest.requireActual("@platform/mobile/test-support/fakeApplication"));
jest.mock("expo-device", () => ({ deviceName: "Test Phone", modelName: "iPhone" }));
jest.mock("react-native-safe-area-context", () => jest.requireActual("react-native-safe-area-context/jest/mock").default);
jest.mock("expo/fetch", () => jest.requireActual("../test-support/fakeExpoFetch"));
jest.mock("expo-speech", () => jest.requireActual("../test-support/fakeSpeech"));
jest.mock("expo-keep-awake", () => ({ useKeepAwake: () => {} }));

const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibilityWithOptions");
const RETRY_PROMPT = "Try saying: Quiero un café.";
const SUGGESTIONS_AND_RETRY = `1 suggestion. ${RETRY_PROMPT}`;

/** Every polite announcement made so far, in order. */
function said(): string[] {
  return announce.mock.calls.map(([message]) => message);
}

beforeEach(() => {
  storedItems.clear();
  storeSession();
  resetSpeech();
  announce.mockClear();
  store.dispatch(baseApi.util.resetApiState());
});

describe("announcing a finished turn's suggestions", () => {
  it("tells a screen reader the suggestions and retry prompt once the turn finishes, and only once", async () => {
    serveConversation();
    const stream = turnStream();
    serveTurns(() => ({ stream }));
    await openCafe();
    await write("Quiero un cafe");
    await serverWrites(() => stream.emit("reply.delta", { text: "¡Hola!" }));
    expect(said()).not.toContain(SUGGESTIONS_AND_RETRY);

    await finish(stream);
    expect(said().filter((message) => message === SUGGESTIONS_AND_RETRY)).toHaveLength(1);

    // Nothing else about the turn changing says it again, including skipping the retry prompt.
    await moveApp("background");
    await moveApp("active");
    await fireEvent.press(screen.getByRole("button", { name: PRACTICE_COPY.skip }));
    expect(screen.queryByText(RETRY_PROMPT)).toBeNull();
    expect(said().filter((message) => message.includes("suggestion"))).toEqual([SUGGESTIONS_AND_RETRY]);
  });

  it("tells a screen reader when a whole reply's suggestions didn't arrive", async () => {
    serveConversation();
    const stream = turnStream();
    serveTurns(() => ({ stream }));
    await openCafe();
    await write("Hola");
    await serverWrites(() => {
      stream.emit("reply.delta", { text: "¡Hola!" });
      stream.emit("reply.done", {});
    });
    await moveApp("background");
    await moveApp("active");
    expect(said()).not.toContain(PRACTICE_COPY.correctionsMissing);

    await act(async () => jest.advanceTimersByTime(RESUMED_TURN_SILENCE_MS));
    expect(await screen.findByText(PRACTICE_COPY.correctionsMissing)).toBeTruthy();
    expect(said().filter((message) => message === PRACTICE_COPY.correctionsMissing)).toHaveLength(1);
  });
});
