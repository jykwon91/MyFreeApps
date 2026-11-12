import { VOICE_COPY } from "@mylanguagetutor/api-client/constants/voiceCopy";
import { practicePath } from "@mylanguagetutor/api-client/utils/practicePath";
import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { router } from "expo-router";
import { storedItems } from "@platform/mobile/test-support/memorySecureStore";
import { VOICE_PRIVACY_ACK_STORAGE_ITEM } from "@mylanguagetutor/api-client/constants/voicePrivacyAck";
import { moveApp } from "../test-support/conversation";
import {
  audioSessionReleases,
  beginRecording,
  failToStart,
  finishAborting,
  goQuiet,
  hear,
  installRecognizer,
  isListening,
  started,
  strayEnd,
} from "../test-support/fakeSpeechRecognition";
import { PRACTICE_HEADING } from "../test-support/onboardedLearner";
import { micButton, openCafeConversation, phone, resetVoiceConversation, tapToSpeak } from "../test-support/voiceConversation";

// iOS runs start, stop and abort each on its own, in no fixed order: these drive the phone through
// the orders it can take, with a start that comes late and an abort that lands late.
jest.mock("expo-secure-store", () => jest.requireActual("@platform/mobile/test-support/memorySecureStore"));
jest.mock("expo-application", () => jest.requireActual("@platform/mobile/test-support/fakeApplication"));
jest.mock("expo-device", () => ({ deviceName: "Test Phone", modelName: "iPhone" }));
jest.mock("react-native-safe-area-context", () => jest.requireActual("react-native-safe-area-context/jest/mock").default);
jest.mock("expo/fetch", () => jest.requireActual("../test-support/fakeExpoFetch"));
jest.mock("expo-speech", () => jest.requireActual("../test-support/fakeSpeech"));
jest.mock("expo-keep-awake", () => ({ useKeepAwake: () => {} }));

beforeEach(() => {
  resetVoiceConversation();
  storedItems.set(VOICE_PRIVACY_ACK_STORAGE_ITEM, "may_send");
});

/** Taps the microphone with the phone slow to start, and waits for the start to be sent. */
async function tapWithLateStart(): Promise<void> {
  await fireEvent.press(micButton(VOICE_COPY.micLabels.idle));
  await waitFor(() => expect(started).toHaveLength(1));
}

describe("the phone starting late", () => {
  it("stops once recording has begun when the learner taps stop before it has, sending nothing", async () => {
    installRecognizer({ startsLate: true });
    const { sent } = await openCafeConversation();
    await tapWithLateStart();

    // The stop overtakes the start: the phone ends at once, then starts recording anyway.
    await fireEvent.press(micButton(VOICE_COPY.micLabels.listening));
    await act(async () => {});
    expect(micButton(VOICE_COPY.micLabels.listening)).toBeTruthy();

    await phone(() => beginRecording());
    await waitFor(() => expect(isListening()).toBe(false));
    expect(micButton(VOICE_COPY.micLabels.idle)).toBeTruthy();
    expect(sent).toHaveLength(0);
  });

  it("aborts once recording has begun when the app goes to the background before it has", async () => {
    installRecognizer({ startsLate: true });
    const { sent } = await openCafeConversation();
    await tapWithLateStart();

    await moveApp("background");
    await act(async () => {});
    await phone(() => beginRecording());
    await waitFor(() => expect(isListening()).toBe(false));
    await moveApp("active");
    expect(micButton(VOICE_COPY.micLabels.idle)).toBeTruthy();
    expect(sent).toHaveLength(0);
  });

  it("listens normally when the phone starts on time, the start arriving before the stop", async () => {
    installRecognizer({ startsLate: true });
    const { sent } = await openCafeConversation();
    await tapWithLateStart();
    await phone(() => beginRecording());
    await phone(() => hear("Hola"));

    await fireEvent.press(micButton(VOICE_COPY.micLabels.listening));
    await waitFor(() => expect(sent.map((request) => request.text)).toEqual(["Hola"]));
    expect(isListening()).toBe(false);
  });

  it("isn't taken over by the attempt left behind when the learner leaves and comes straight back", async () => {
    installRecognizer({ startsLate: true });
    const { sent } = await openCafeConversation();
    await tapWithLateStart();
    await act(async () => router.back());
    expect(await screen.findByRole("header", { name: PRACTICE_HEADING })).toBeTruthy();
    await act(async () => router.push(practicePath("cafe")));
    expect(await screen.findByRole("header", { name: "At the cafe" })).toBeTruthy();
    await fireEvent.press(micButton(VOICE_COPY.micLabels.idle));
    expect(micButton(VOICE_COPY.micLabels.listening)).toBeTruthy();

    // The first attempt's start arrives, then the second's: had the second been sent while the first
    // was still on, its start would reset the first, whose end then arrives after the new start.
    await phone(() => beginRecording());
    await waitFor(() => expect(started).toHaveLength(2));
    await phone(() => beginRecording());
    expect(isListening()).toBe(true);
    expect(micButton(VOICE_COPY.micLabels.listening)).toBeTruthy();
    await phone(() => hear("Hola"));
    expect(screen.getByTestId("heard-so-far")).toHaveTextContent("Hola");
    await phone(() => goQuiet());
    expect(sent.map((request) => request.text)).toEqual(["Hola"]);
    expect(audioSessionReleases).toEqual([false, false]);
  });

  it("isn't failed by the abort of the attempt left behind when the learner leaves and comes straight back", async () => {
    installRecognizer({ abortsLate: true });
    const { sent } = await openCafeConversation();
    await tapToSpeak();
    await phone(() => hear("Quiero"));
    await act(async () => router.back());
    expect(await screen.findByRole("header", { name: PRACTICE_HEADING })).toBeTruthy();
    await act(async () => router.push(practicePath("cafe")));
    expect(await screen.findByRole("header", { name: "At the cafe" })).toBeTruthy();
    await fireEvent.press(micButton(VOICE_COPY.micLabels.idle));

    // The first attempt's abort lands only now: its aborted error and end are its own.
    await phone(() => finishAborting());
    await waitFor(() => expect(started).toHaveLength(2));
    await waitFor(() => expect(isListening()).toBe(true));
    expect(micButton(VOICE_COPY.micLabels.listening)).toBeTruthy();
    await phone(() => hear("Hola"));
    await phone(() => goQuiet());
    expect(sent.map((request) => request.text)).toEqual(["Hola"]);
  });

  it("stops listening when the learner taps stop after the phone failed to start without ending", async () => {
    installRecognizer({ startsLate: true });
    const { sent } = await openCafeConversation();
    await tapWithLateStart();
    await phone(() => failToStart("audio-capture"));
    expect(micButton(VOICE_COPY.micLabels.listening)).toBeTruthy();

    await fireEvent.press(micButton(VOICE_COPY.micLabels.listening));
    expect(micButton(VOICE_COPY.micLabels.idle)).toBeTruthy();
    expect(screen.getByText(VOICE_COPY.unavailable)).toBeTruthy();
    expect(audioSessionReleases).toEqual([false]);

    await phone(() => strayEnd());
    expect(audioSessionReleases).toEqual([false]);
    expect(sent).toHaveLength(0);
  });

  it("stops listening when the app goes to the background after the phone failed to start without ending", async () => {
    installRecognizer({ startsLate: true });
    await openCafeConversation();
    await tapWithLateStart();
    await phone(() => failToStart("audio-capture"));

    await moveApp("background");
    await moveApp("active");
    expect(micButton(VOICE_COPY.micLabels.idle)).toBeTruthy();
    expect(audioSessionReleases).toEqual([false]);
  });

  it("listens again after leaving a screen whose start failed without ending", async () => {
    installRecognizer({ startsLate: true });
    const { sent } = await openCafeConversation();
    await tapWithLateStart();
    await phone(() => failToStart("audio-capture"));
    await act(async () => router.back());
    expect(await screen.findByRole("header", { name: PRACTICE_HEADING })).toBeTruthy();
    expect(audioSessionReleases).toEqual([false]);

    await act(async () => router.push(practicePath("cafe")));
    expect(await screen.findByRole("header", { name: "At the cafe" })).toBeTruthy();
    await fireEvent.press(micButton(VOICE_COPY.micLabels.idle));
    await waitFor(() => expect(started).toHaveLength(2));
    await phone(() => beginRecording());
    await phone(() => goQuiet("Hola"));
    expect(sent.map((request) => request.text)).toEqual(["Hola"]);
  });
});
