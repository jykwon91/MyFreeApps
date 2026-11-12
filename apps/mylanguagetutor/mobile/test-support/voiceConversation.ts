// Drives the voice side of the conversation screen, for the voice-input tests.
import { VOICE_COPY } from "@mylanguagetutor/api-client/constants/voiceCopy";
import { baseApi } from "@platform/core/store/baseApi";
import { storedItems } from "@platform/mobile/test-support/memorySecureStore";
import { storeSession } from "@platform/mobile/test-support/storedSession";
import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { store } from "../src/lib/store";
import { openCafe, serveConversation } from "./conversation";
import { serveTurns, turnStream } from "./fakeExpoFetch";
import { installVoices, resetSpeech, voice } from "./fakeSpeech";
import { isListening, resetRecognizer } from "./fakeSpeechRecognition";
import type { FakeTurnRequest } from "./types/FakeTurnRequest";
import type { FakeTurnStream } from "./types/FakeTurnStream";

const MEXICO = voice("com.apple.voice.compact.es-MX.Paulina", "es-MX");

/** A signed-in learner on a phone with a Mexican Spanish voice and, until a test installs one, no recognizer. */
export function resetVoiceConversation(): void {
  storedItems.clear();
  storeSession();
  resetSpeech();
  resetRecognizer();
  installVoices([MEXICO]);
  store.dispatch(baseApi.util.resetApiState());
}

/** The cafe conversation, with each turn the learner sends answered on the next stream. */
export async function openCafeConversation(): Promise<{ sent: FakeTurnRequest[]; streams: FakeTurnStream[] }> {
  serveConversation();
  const streams = [turnStream(), turnStream()];
  let turn = 0;
  const sent = serveTurns(() => ({ stream: streams[turn++] }));
  await openCafe();
  return { sent, streams };
}

export function micButton(name: string) {
  return screen.getByRole("button", { name });
}

/** The phone's recognizer sends its events. */
export async function phone(send: () => Promise<void>): Promise<void> {
  await act(send);
}

/** Taps the microphone and waits for the phone to start listening. */
export async function tapToSpeak(name: string = VOICE_COPY.micLabels.idle): Promise<void> {
  await fireEvent.press(micButton(name));
  await waitFor(() => expect(isListening()).toBe(true));
}

/** Reads the privacy notice, allows the microphone, and waits for the phone to listen. */
export async function continueToMicrophone(): Promise<void> {
  await fireEvent.press(screen.getByRole("button", { name: VOICE_COPY.privacyContinue }));
  await waitFor(() => expect(isListening()).toBe(true));
}
