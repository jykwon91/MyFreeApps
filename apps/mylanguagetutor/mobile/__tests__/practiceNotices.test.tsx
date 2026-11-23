import { PRACTICE_COPY } from "@mylanguagetutor/api-client/constants/practiceCopy";
import { PRACTICE_NOTICE_COPY } from "@mylanguagetutor/api-client/constants/practiceNoticeCopy";
import { SESSION_NOT_FOUND } from "@mylanguagetutor/api-client/constants/turnFailureCodes";
import { VOICE_COPY } from "@mylanguagetutor/api-client/constants/voiceCopy";
import { baseApi } from "@platform/core/store/baseApi";
import { storedItems } from "@platform/mobile/test-support/memorySecureStore";
import { storeSession } from "@platform/mobile/test-support/storedSession";
import { act, fireEvent, screen } from "@testing-library/react-native";
import { ExpoSpeechRecognitionModule } from "expo-speech-recognition";
import { Platform } from "react-native";
import { store } from "../src/lib/store";
import { finish, openCafe, serveConversation, serverWrites, write } from "../test-support/conversation";
import { serveTurns, turnStream } from "../test-support/fakeExpoFetch";
import { resetSpeech } from "../test-support/fakeSpeech";
import { installRecognizer, resetRecognizer } from "../test-support/fakeSpeechRecognition";

jest.mock("expo-secure-store", () => jest.requireActual("@platform/mobile/test-support/memorySecureStore"));
jest.mock("expo-application", () => jest.requireActual("@platform/mobile/test-support/fakeApplication"));
jest.mock("expo-device", () => ({ deviceName: "Test Phone", modelName: "iPhone" }));
jest.mock("react-native-safe-area-context", () => jest.requireActual("react-native-safe-area-context/jest/mock").default);
jest.mock("expo/fetch", () => jest.requireActual("../test-support/fakeExpoFetch"));
jest.mock("expo-speech", () => jest.requireActual("../test-support/fakeSpeech"));
jest.mock("expo-keep-awake", () => ({ useKeepAwake: () => {} }));

beforeEach(() => {
  storedItems.clear();
  storeSession();
  resetSpeech();
  resetRecognizer();
  store.dispatch(baseApi.util.resetApiState());
});

describe("notices on the conversation screen", () => {
  it("tells the learner a long answer was shortened, until they dismiss it", async () => {
    serveConversation();
    const stream = turnStream();
    const turns = serveTurns(() => ({ stream }));
    await openCafe();

    await write("palabra ".repeat(100));
    await serverWrites(() => stream.emit("reply.delta", { text: "¡Hola!" }));
    await finish(stream);

    expect(turns[0].text.length).toBeLessThanOrEqual(500);
    expect(screen.getByText(PRACTICE_NOTICE_COPY.truncated)).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: PRACTICE_COPY.dismiss }));
    expect(screen.queryByText(PRACTICE_NOTICE_COPY.truncated)).toBeNull();
  });

  it("tells the learner the conversation restarted, keeping what they said before", async () => {
    serveConversation();
    const streams = [turnStream(), turnStream()];
    let turn = 0;
    serveTurns(() => {
      turn += 1;
      if (turn === 1) return { status: 404, data: { detail: SESSION_NOT_FOUND } };
      return { stream: streams[turn - 2] };
    });
    await openCafe();

    await write("Hola");
    await fireEvent.press(await screen.findByRole("button", { name: PRACTICE_COPY.tryAgain }));
    await serverWrites(() => streams[0].emit("reply.delta", { text: "¡Hola!" }));
    await finish(streams[0]);

    expect(screen.getByText(PRACTICE_NOTICE_COPY.restarted)).toBeTruthy();
    expect(screen.getByText("Hola")).toBeTruthy();
  });
});

describe("the composer while the phone is still being asked about on-device speech", () => {
  it("offers the typed answer rather than nothing", async () => {
    const platform = jest.replaceProperty(Platform, "OS", "android");
    installRecognizer({ onDevice: true });
    const pending = jest.spyOn(ExpoSpeechRecognitionModule, "getSupportedLocales").mockReturnValue(new Promise(() => {}));
    serveConversation();
    await openCafe();

    await act(async () => {});
    expect(screen.getByLabelText(PRACTICE_COPY.typeYourAnswer)).toBeTruthy();
    expect(screen.queryByRole("header", { name: VOICE_COPY.privacyHeading })).toBeNull();
    pending.mockRestore();
    platform.restore();
  });
});
