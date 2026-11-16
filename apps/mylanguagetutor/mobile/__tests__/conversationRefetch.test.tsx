import { CATALOG_COPY } from "@mylanguagetutor/api-client/constants/catalogCopy";
import { practicePath } from "@mylanguagetutor/api-client/utils/practicePath";
import { baseApi } from "@platform/core/store/baseApi";
import { storedItems } from "@platform/mobile/test-support/memorySecureStore";
import { storeSession } from "@platform/mobile/test-support/storedSession";
import type { FakeReply } from "@platform/mobile/test-support/types/FakeReply";
import type { FakeRoute } from "@platform/mobile/test-support/types/FakeRoute";
import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { store } from "../src/lib/store";
import { finish, moveApp, openCafe, serveConversation, serverWrites, write } from "../test-support/conversation";
import { serveTurns, turnStream } from "../test-support/fakeExpoFetch";
import { resetSpeech } from "../test-support/fakeSpeech";
import { renderApp } from "../test-support/renderApp";
import { SCENARIOS, SPANISH } from "../test-support/tutorRecords";

jest.mock("expo-secure-store", () => jest.requireActual("@platform/mobile/test-support/memorySecureStore"));
jest.mock("expo-application", () => jest.requireActual("@platform/mobile/test-support/fakeApplication"));
jest.mock("expo-device", () => ({ deviceName: "Test Phone", modelName: "iPhone" }));
jest.mock("react-native-safe-area-context", () => jest.requireActual("react-native-safe-area-context/jest/mock").default);
jest.mock("expo/fetch", () => jest.requireActual("../test-support/fakeExpoFetch"));
jest.mock("expo-speech", () => jest.requireActual("../test-support/fakeSpeech"));
jest.mock("expo-keep-awake", () => ({ useKeepAwake: () => {} }));

/** Answers with `reply` while `isDown()` is false, and with a server error while it is true. */
function downWhile(isDown: () => boolean, reply: FakeReply): FakeRoute {
  return () => (isDown() ? { status: 500, data: {} } : reply);
}

/** Where the cached languages and scenarios stand: "fulfilled" once loaded, "rejected" once a refetch failed. */
function catalogStatuses(): (string | undefined)[] {
  const queries = Object.values(store.getState().api.queries);
  return ["listLanguages", "listScenarios"].map((name) => queries.find((query) => query?.endpointName === name)?.status);
}

beforeEach(() => {
  storedItems.clear();
  storeSession();
  resetSpeech();
  store.dispatch(baseApi.util.resetApiState());
});

describe("the conversation when the catalog is refetched", () => {
  it("keeps the conversation going when a refetch fails after the learner comes back to the app", async () => {
    let isDown = false;
    serveConversation({
      "GET /languages": downWhile(() => isDown, { status: 200, data: [SPANISH] }),
      "GET /scenarios": downWhile(() => isDown, { status: 200, data: SCENARIOS }),
    });
    const stream = turnStream();
    serveTurns(() => ({ stream }));
    await openCafe();
    await write("Hola");
    await serverWrites(() => stream.emit("reply.delta", { text: "¡Hola! Bienvenido" }));
    await finish(stream);

    isDown = true;
    await moveApp("background");
    await moveApp("active");
    await waitFor(() => expect(catalogStatuses()).toEqual(["rejected", "rejected"]));
    // The load-failed screen would take a moment to draw if the conversation were replaced by it.
    await expect(waitFor(() => expect(screen.getByText(CATALOG_COPY.loadFailed)).toBeTruthy(), { timeout: 500 })).rejects.toThrow();

    expect(screen.queryByRole("header", { name: CATALOG_COPY.loadFailed })).toBeNull();
    expect(screen.getByRole("header", { name: "At the cafe" })).toBeTruthy();
    expect(screen.getByText("Hola")).toBeTruthy();
    expect(screen.getByText("¡Hola! Bienvenido")).toBeTruthy();
  });

  it("still says the scenario can't load, and tries again, when the first load fails", async () => {
    let isDown = true;
    serveConversation({ "GET /scenarios": downWhile(() => isDown, { status: 200, data: SCENARIOS }) });
    await renderApp(practicePath("cafe"));

    expect(await screen.findByRole("header", { name: CATALOG_COPY.loadFailed })).toBeTruthy();
    isDown = false;
    await fireEvent.press(screen.getByRole("button", { name: CATALOG_COPY.retry }));
    expect(await screen.findByRole("header", { name: "At the cafe" })).toBeTruthy();
  });
});
