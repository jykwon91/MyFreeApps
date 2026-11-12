import { ExpoSpeechRecognitionModule } from "expo-speech-recognition";
import type { SpeechAttempt } from "../types/SpeechAttempt";
import { releaseAudioSession } from "./releaseAudioSession";

/** Settles once the attempt left behind by a closed screen has ended on the phone. */
let settled: Promise<void> = Promise.resolve();

/**
 * Ends an attempt the phone was asked to start whose screen has gone, and its own listeners with it:
 * aborts it now, or once the phone says it has started if it hasn't yet (the phone runs start and
 * abort in no fixed order), and lets iOS's audio session go once it has ended. Until then its events
 * are its own, so no new attempt starts (see `orphanedAttemptEnded`).
 */
export function abortOrphanedAttempt(attempt: SpeechAttempt): void {
  let recording = attempt.stage === "live";
  settled = new Promise((resolve) => {
    const settle = () => {
      subscriptions.forEach((subscription) => subscription.remove());
      releaseAudioSession();
      resolve();
    };
    const subscriptions = [
      ExpoSpeechRecognitionModule.addListener("start", () => {
        recording = true;
        ExpoSpeechRecognitionModule.abort();
      }),
      // Failing to start, iOS may send the error with no end: nothing is recording.
      ExpoSpeechRecognitionModule.addListener("error", () => {
        if (!recording) settle();
      }),
      ExpoSpeechRecognitionModule.addListener("end", settle),
    ];
  });
  if (recording) ExpoSpeechRecognitionModule.abort();
}

/** Resolves once no attempt left behind is still on the phone; at once if there is none. */
export function orphanedAttemptEnded(): Promise<void> {
  return settled;
}
