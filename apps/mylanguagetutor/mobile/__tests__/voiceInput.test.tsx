import { PRACTICE_COPY } from "@mylanguagetutor/api-client/constants/practiceCopy";
import { VOICE_COPY } from "@mylanguagetutor/api-client/constants/voiceCopy";
import { storedItems } from "@platform/mobile/test-support/memorySecureStore";
import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { router } from "expo-router";
import { AccessibilityInfo, Linking, Platform } from "react-native";
import { LISTENING_AUDIO_SESSION, PHONE_VOICE_COPY } from "../src/constants/voice";
import { VOICE_PRIVACY_ACK_STORAGE_ITEM } from "@mylanguagetutor/api-client/constants/voicePrivacyAck";
import { finish, moveApp, serverWrites } from "../test-support/conversation";
import { finishSpeaking, spoken } from "../test-support/fakeSpeech";
import {
  allowInSettings,
  audioSessionReleases,
  beginRecording,
  failWith,
  goQuiet,
  hear,
  hearNothing,
  installRecognizer,
  isListening,
  permissionRequests,
  started,
} from "../test-support/fakeSpeechRecognition";
import { PRACTICE_HEADING } from "../test-support/onboardedLearner";
import { continueToMicrophone, micButton, openCafeConversation, phone, resetVoiceConversation, tapToSpeak } from "../test-support/voiceConversation";
import type { FakeTurnStream } from "../test-support/types/FakeTurnStream";

jest.mock("expo-secure-store", () => jest.requireActual("@platform/mobile/test-support/memorySecureStore"));
jest.mock("expo-application", () => jest.requireActual("@platform/mobile/test-support/fakeApplication"));
jest.mock("expo-device", () => ({ deviceName: "Test Phone", modelName: "iPhone" }));
jest.mock("react-native-safe-area-context", () => jest.requireActual("react-native-safe-area-context/jest/mock").default);
jest.mock("expo/fetch", () => jest.requireActual("../test-support/fakeExpoFetch"));
jest.mock("expo-speech", () => jest.requireActual("../test-support/fakeSpeech"));
jest.mock("expo-keep-awake", () => ({ useKeepAwake: () => {} }));

const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibilityWithOptions");
const openSettings = jest.spyOn(Linking, "openSettings");

beforeEach(() => {
  resetVoiceConversation();
  announce.mockClear();
  openSettings.mockReset().mockResolvedValue(undefined);
});

let platform: jest.ReplaceProperty<typeof Platform.OS> | null = null;

afterEach(() => {
  platform?.restore();
  platform = null;
});

/** The tutor's reply to the first turn, in full, which the phone then reads out. */
async function tutorReplies(stream: FakeTurnStream): Promise<void> {
  await serverWrites(() => stream.emit("reply.delta", { text: "¡Claro! ¿Algo más?" }));
  await finish(stream);
}

function androidPhone(): void {
  platform = jest.replaceProperty(Platform, "OS", "android");
}

describe("speaking an answer", () => {
  it("listens after the privacy notice, shows the words as they're heard, and sends them once the learner goes quiet", async () => {
    installRecognizer();
    const { sent, streams } = await openCafeConversation();

    expect(screen.getByRole("header", { name: VOICE_COPY.privacyHeading })).toBeTruthy();
    expect(screen.getByText(`• ${PHONE_VOICE_COPY.recognizerMaySendIos}`)).toBeTruthy();
    expect(screen.getByText(`• ${VOICE_COPY.privacyTutor}`)).toBeTruthy();
    await continueToMicrophone();

    expect(storedItems.get(VOICE_PRIVACY_ACK_STORAGE_ITEM)).toBe("may_send");
    expect(permissionRequests).toHaveLength(1);
    expect(started).toEqual([
      {
        lang: "es-MX",
        interimResults: true,
        continuous: false,
        maxAlternatives: 1,
        requiresOnDeviceRecognition: true,
        iosCategory: LISTENING_AUDIO_SESSION,
      },
    ]);
    expect(screen.getByText(VOICE_COPY.listening)).toBeTruthy();
    expect(micButton(VOICE_COPY.micLabels.listening).props.accessibilityState).toMatchObject({ selected: true });

    await phone(() => hear("Quiero"));
    expect(screen.getByTestId("heard-so-far")).toHaveTextContent("Quiero");
    await phone(() => hear("Quiero un café"));
    expect(screen.getByTestId("heard-so-far")).toHaveTextContent("Quiero un café");
    expect(sent).toHaveLength(0);

    await phone(() => goQuiet("Quiero un café, por favor"));
    expect(sent.map((request) => request.text)).toEqual(["Quiero un café, por favor"]);
    expect(audioSessionReleases).toEqual([false]);
    expect(screen.getByText("Quiero un café, por favor")).toBeTruthy();
    expect(screen.queryByText(VOICE_COPY.listening)).toBeNull();
    expect(micButton(VOICE_COPY.micLabels.waiting).props.accessibilityState).toMatchObject({ disabled: true });
    expect(announce).toHaveBeenCalledWith(VOICE_COPY.micLabels.waiting, { queue: true });

    await tutorReplies(streams[0]);
    expect(spoken.filter((utterance) => utterance !== null).map((utterance) => utterance.text)).toEqual(["¡Claro!", "¿Algo más?"]);
    expect(micButton(VOICE_COPY.micLabels.speaking)).toBeTruthy();
    await act(async () => finishSpeaking());
    expect(micButton(VOICE_COPY.micLabels.idle)).toBeTruthy();

    // The notice was read: the next answer goes straight to the microphone.
    await tapToSpeak();
    expect(permissionRequests).toHaveLength(2);
    await phone(() => goQuiet("Nada más"));
    expect(sent.map((request) => request.text)).toEqual(["Quiero un café, por favor", "Nada más"]);
  });

  it("sends what was heard when the learner taps the microphone to stop", async () => {
    installRecognizer();
    const { sent } = await openCafeConversation();
    await continueToMicrophone();
    await phone(() => hear("Hola"));

    await fireEvent.press(micButton(VOICE_COPY.micLabels.listening));
    await waitFor(() => expect(sent.map((request) => request.text)).toEqual(["Hola"]));
  });

  it("interrupts the tutor's voice when the learner taps the microphone while it speaks", async () => {
    installRecognizer();
    storedItems.set(VOICE_PRIVACY_ACK_STORAGE_ITEM, "may_send");
    const { sent, streams } = await openCafeConversation();
    await tapToSpeak();
    await phone(() => goQuiet("Quiero un café"));
    await tutorReplies(streams[0]);
    expect(spoken.at(-1)).not.toBeNull();

    await tapToSpeak(VOICE_COPY.micLabels.speaking);
    expect(spoken.at(-1)).toBeNull();
    expect(micButton(VOICE_COPY.micLabels.listening)).toBeTruthy();
    await phone(() => goQuiet("Y un pan"));
    expect(sent.map((request) => request.text)).toEqual(["Quiero un café", "Y un pan"]);
  });

  it("keeps the microphone off while a reply is on its way", async () => {
    installRecognizer();
    storedItems.set(VOICE_PRIVACY_ACK_STORAGE_ITEM, "may_send");
    const { streams } = await openCafeConversation();
    await tapToSpeak();
    await phone(() => goQuiet("Hola"));
    await serverWrites(() => streams[0].emit("reply.delta", { text: "¡Hola!" }));

    expect(micButton(VOICE_COPY.micLabels.replying).props.accessibilityState).toMatchObject({ disabled: true });
    await fireEvent.press(micButton(VOICE_COPY.micLabels.replying));
    expect(started).toHaveLength(1);
  });

  it("says it didn't catch anything when the learner says nothing, and sends nothing", async () => {
    installRecognizer();
    storedItems.set(VOICE_PRIVACY_ACK_STORAGE_ITEM, "may_send");
    const { sent } = await openCafeConversation();
    await tapToSpeak();
    await phone(() => hearNothing());

    expect(screen.getByText(VOICE_COPY.noSpeech)).toBeTruthy();
    expect(announce).toHaveBeenCalledWith(VOICE_COPY.noSpeech, { queue: true });
    expect(sent).toHaveLength(0);

    await tapToSpeak();
    expect(screen.queryByText(VOICE_COPY.noSpeech)).toBeNull();
  });

  it("sends what was heard, with no hint, when iOS says it heard nothing after hearing words", async () => {
    installRecognizer();
    storedItems.set(VOICE_PRIVACY_ACK_STORAGE_ITEM, "may_send");
    const { sent } = await openCafeConversation();
    await tapToSpeak();
    await phone(() => hear("Quiero un café"));
    await phone(() => failWith("no-speech"));

    expect(sent.map((request) => request.text)).toEqual(["Quiero un café"]);
    expect(screen.queryByText(VOICE_COPY.noSpeech)).toBeNull();
  });

  it("says it didn't catch anything when the recognizer times out on silence", async () => {
    installRecognizer();
    storedItems.set(VOICE_PRIVACY_ACK_STORAGE_ITEM, "may_send");
    const { sent } = await openCafeConversation();
    await tapToSpeak();
    await phone(() => failWith("no-speech"));

    expect(screen.getByText(VOICE_COPY.noSpeech)).toBeTruthy();
    expect(sent).toHaveLength(0);
  });

  it("offers typing when the phone's speech service fails", async () => {
    installRecognizer();
    storedItems.set(VOICE_PRIVACY_ACK_STORAGE_ITEM, "may_send");
    await openCafeConversation();
    await tapToSpeak();
    await phone(() => failWith("network"));

    expect(screen.getByText(VOICE_COPY.unavailable)).toBeTruthy();
    expect(micButton(VOICE_COPY.micLabels.idle)).toBeTruthy();
  });

  it("drops what was heard when a call takes the microphone", async () => {
    installRecognizer();
    storedItems.set(VOICE_PRIVACY_ACK_STORAGE_ITEM, "may_send");
    const { sent } = await openCafeConversation();
    await tapToSpeak();
    await phone(() => hear("Quiero"));
    await phone(() => failWith("interrupted"));

    expect(sent).toHaveLength(0);
    expect(screen.queryByText(VOICE_COPY.unavailable)).toBeNull();
    expect(micButton(VOICE_COPY.micLabels.idle)).toBeTruthy();
    expect(audioSessionReleases).toEqual([false]);
  });
});

describe("the microphone refused", () => {
  it("explains how to allow it, opens Settings, offers typing, and comes back once allowed", async () => {
    installRecognizer({ permission: "denied" });
    const { sent } = await openCafeConversation();
    await fireEvent.press(screen.getByRole("button", { name: VOICE_COPY.privacyContinue }));

    expect(await screen.findByRole("header", { name: VOICE_COPY.micBlocked })).toBeTruthy();
    expect(screen.getByText(PHONE_VOICE_COPY.micBlockedBody)).toBeTruthy();
    expect(announce).toHaveBeenCalledWith(VOICE_COPY.micBlocked, { queue: true });
    expect(started).toHaveLength(0);
    await fireEvent.press(screen.getByRole("button", { name: PHONE_VOICE_COPY.openSettings }));
    expect(openSettings).toHaveBeenCalledTimes(1);

    await moveApp("background");
    await moveApp("active");
    await act(async () => jest.advanceTimersByTime(0));
    expect(screen.getByRole("header", { name: VOICE_COPY.micBlocked })).toBeTruthy();

    allowInSettings();
    await moveApp("background");
    await moveApp("active");
    await act(async () => jest.advanceTimersByTime(0));
    await tapToSpeak();
    await phone(() => goQuiet("Hola"));
    expect(sent.map((request) => request.text)).toEqual(["Hola"]);
  });

  it("lets the learner type instead", async () => {
    installRecognizer({ permission: "denied" });
    const { sent } = await openCafeConversation();
    await fireEvent.press(screen.getByRole("button", { name: VOICE_COPY.privacyContinue }));
    await fireEvent.press(await screen.findByRole("button", { name: VOICE_COPY.typeInstead }));

    await fireEvent.changeText(screen.getByLabelText(PRACTICE_COPY.typeYourAnswer), "Hola");
    await fireEvent.press(screen.getByRole("button", { name: PRACTICE_COPY.send }));
    expect(sent.map((request) => request.text)).toEqual(["Hola"]);
  });
});

describe("where speech becomes text", () => {
  it("tells an Android learner the audio stays on the phone when it recognizes the language there, and asks it to", async () => {
    androidPhone();
    installRecognizer({ onDevice: true, installedLocales: ["en-US", "es_MX"] });
    await openCafeConversation();

    expect(await screen.findByText(`• ${PHONE_VOICE_COPY.recognizerOnDevice}`)).toBeTruthy();
    await continueToMicrophone();
    expect(started[0]).toMatchObject({ lang: "es-MX", requiresOnDeviceRecognition: true });
    expect(storedItems.get(VOICE_PRIVACY_ACK_STORAGE_ITEM)).toBe("on_device");
    expect(audioSessionReleases).toEqual([]);
  });

  it("tells an Android learner the audio may leave the phone when the language isn't installed for on-device", async () => {
    androidPhone();
    installRecognizer({ onDevice: true, installedLocales: ["en-US"] });
    await openCafeConversation();

    expect(await screen.findByText(`• ${PHONE_VOICE_COPY.recognizerMaySendAndroid}`)).toBeTruthy();
    await continueToMicrophone();
    expect(started[0]).toMatchObject({ requiresOnDeviceRecognition: false });
  });

  it("tells an Android learner the audio may leave the phone when it has no on-device recognizer", async () => {
    androidPhone();
    installRecognizer({ onDevice: false, installedLocales: ["es-MX"] });
    await openCafeConversation();

    expect(await screen.findByText(`• ${PHONE_VOICE_COPY.recognizerMaySendAndroid}`)).toBeTruthy();
  });

  it("shows the notice again when the audio may now leave the phone, having read the on-device one", async () => {
    installRecognizer();
    storedItems.set(VOICE_PRIVACY_ACK_STORAGE_ITEM, "on_device");
    await openCafeConversation();

    expect(screen.getByText(`• ${PHONE_VOICE_COPY.recognizerMaySendIos}`)).toBeTruthy();
  });

  it("doesn't show the notice again for on-device recognition, having read the one that says audio may leave", async () => {
    androidPhone();
    installRecognizer({ onDevice: true, installedLocales: ["es-MX"] });
    storedItems.set(VOICE_PRIVACY_ACK_STORAGE_ITEM, "may_send");
    await openCafeConversation();

    expect(await screen.findByRole("button", { name: VOICE_COPY.micLabels.idle })).toBeTruthy();
    expect(screen.queryByRole("header", { name: VOICE_COPY.privacyHeading })).toBeNull();
  });
});

describe("switching between speaking and typing", () => {
  it("types instead from the privacy notice, and goes back to the microphone", async () => {
    installRecognizer();
    const { sent } = await openCafeConversation();
    await fireEvent.press(screen.getByRole("button", { name: VOICE_COPY.typeInstead }));

    expect(screen.queryByRole("header", { name: VOICE_COPY.privacyHeading })).toBeNull();
    await fireEvent.changeText(screen.getByLabelText(PRACTICE_COPY.typeYourAnswer), "Hola");
    await fireEvent.press(screen.getByRole("button", { name: PRACTICE_COPY.send }));
    expect(sent.map((request) => request.text)).toEqual(["Hola"]);
    expect(started).toHaveLength(0);

    await fireEvent.press(screen.getByRole("button", { name: VOICE_COPY.useMicrophone }));
    expect(screen.getByRole("header", { name: VOICE_COPY.privacyHeading })).toBeTruthy();
  });

  it("sends what was heard when the learner switches to typing mid-answer, as the website does", async () => {
    installRecognizer();
    storedItems.set(VOICE_PRIVACY_ACK_STORAGE_ITEM, "may_send");
    const { sent } = await openCafeConversation();
    await tapToSpeak();
    await phone(() => hear("Hola"));

    await fireEvent.press(screen.getByRole("button", { name: VOICE_COPY.typeInstead }));
    await waitFor(() => expect(sent.map((request) => request.text)).toEqual(["Hola"]));
    expect(screen.getByLabelText(PRACTICE_COPY.typeYourAnswer)).toBeTruthy();
  });

  it("types on a phone without speech recognition, and says why", async () => {
    await openCafeConversation();

    expect(screen.getByLabelText(PRACTICE_COPY.typingOnlyLabel)).toBeTruthy();
    expect(screen.getByText(PHONE_VOICE_COPY.typingOnlyNote)).toBeTruthy();
    expect(screen.queryByRole("button", { name: VOICE_COPY.useMicrophone })).toBeNull();
    expect(screen.queryByTestId("mic-button")).toBeNull();
  });
});

describe("listening stops", () => {
  it("when the app goes to the background, dropping what was heard", async () => {
    installRecognizer();
    storedItems.set(VOICE_PRIVACY_ACK_STORAGE_ITEM, "may_send");
    const { sent } = await openCafeConversation();
    await tapToSpeak();
    await phone(() => hear("Quiero"));

    await moveApp("background");
    await waitFor(() => expect(isListening()).toBe(false));
    await moveApp("active");

    expect(sent).toHaveLength(0);
    expect(micButton(VOICE_COPY.micLabels.idle)).toBeTruthy();
    expect(screen.queryByText(VOICE_COPY.unavailable)).toBeNull();
    expect(audioSessionReleases).toEqual([false]);
  });

  it("when the learner leaves the conversation, sending nothing", async () => {
    installRecognizer();
    storedItems.set(VOICE_PRIVACY_ACK_STORAGE_ITEM, "may_send");
    const { sent } = await openCafeConversation();
    await tapToSpeak();
    await phone(() => hear("Quiero"));

    await act(async () => router.back());
    expect(await screen.findByRole("header", { name: PRACTICE_HEADING })).toBeTruthy();
    await waitFor(() => expect(isListening()).toBe(false));
    expect(sent).toHaveLength(0);
    expect(audioSessionReleases).toEqual([false]);
  });

  it("when the learner leaves before the phone has started recording, once it has", async () => {
    installRecognizer({ startsLate: true });
    storedItems.set(VOICE_PRIVACY_ACK_STORAGE_ITEM, "may_send");
    const { sent } = await openCafeConversation();
    await fireEvent.press(micButton(VOICE_COPY.micLabels.idle));
    await waitFor(() => expect(started).toHaveLength(1));

    await act(async () => router.back());
    expect(await screen.findByRole("header", { name: PRACTICE_HEADING })).toBeTruthy();
    await phone(() => beginRecording());
    await waitFor(() => expect(isListening()).toBe(false));
    expect(sent).toHaveLength(0);
    expect(audioSessionReleases).toEqual([false]);
  });
});
