import { NOTHING_HEARD } from "@mylanguagetutor/api-client/constants/heardSpeech";
import type { RecognitionFailure } from "@mylanguagetutor/api-client/types/speech/recognition-failure";
import { finalTranscript } from "@mylanguagetutor/api-client/utils/finalTranscript";
import { liveTranscript } from "@mylanguagetutor/api-client/utils/liveTranscript";
import { recognitionFailure } from "@mylanguagetutor/api-client/utils/recognitionFailure";
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from "expo-speech-recognition";
import { useCallback, useEffect, useRef, useState } from "react";
import { RECHECK_PERMISSION_MS } from "../constants/voice";
import { abortOrphanedAttempt, orphanedAttemptEnded } from "../lib/orphanedAttempt";
import { releaseAudioSession } from "../lib/releaseAudioSession";
import type { SpeechAttempt } from "../types/SpeechAttempt";
import type { SpeechInputControls } from "../types/SpeechInputControls";
import { heardFromResult } from "../utils/heardFromResult";
import { recognitionOptions } from "../utils/recognitionOptions";
import { useOnResume } from "./useOnResume";

function couldNotListen(error: unknown): void {
  console.warn("The phone couldn't start listening", error);
}

/**
 * One utterance of the phone's speech recognition, as the website's browser recognition: the words
 * as they're heard, then `onFinal` with what was said once the learner goes quiet or taps stop.
 * The phone asks for the microphone (and, on iOS, speech recognition) on first use. A refused
 * permission is cleared when the learner comes back having allowed it in Settings. `abort` drops
 * what was heard, as does the phone taking the microphone for a call (iOS reports that as
 * interrupted); the screen closing aborts too. `onDevice` is null until it's known whether the phone
 * recognizes the language on the device; listening waits for that.
 *
 * The phone's events carry no attempt, and iOS runs start, stop and abort in no fixed order: a stop
 * sent straight after start can end before recording begins, leaving the microphone on. So each tap
 * is one attempt, its events count only once its own `start` has arrived, and a stop or abort asked
 * for before that is sent from the `start` handler.
 */
export function useSpeechInput(locale: string, onDevice: boolean | null, onFinal: (text: string) => void): SpeechInputControls {
  const [supported] = useState(() => ExpoSpeechRecognitionModule.isRecognitionAvailable());
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [failure, setFailure] = useState<RecognitionFailure | null>(null);
  const attempt = useRef<SpeechAttempt | null>(null);
  const onFinalRef = useRef(onFinal);

  useEffect(() => {
    onFinalRef.current = onFinal;
  }, [onFinal]);

  const finish = useCallback(() => {
    attempt.current = null;
    setListening(false);
    setInterim("");
  }, []);

  useSpeechRecognitionEvent("start", () => {
    const current = attempt.current;
    if (current?.stage !== "starting") return;
    current.stage = "live";
    if (current.pending === "abort") ExpoSpeechRecognitionModule.abort();
    else if (current.pending === "stop") ExpoSpeechRecognitionModule.stop();
  });

  useSpeechRecognitionEvent("result", (event) => {
    const current = attempt.current;
    if (current?.stage !== "live") return;
    current.heard = heardFromResult(event);
    setInterim(liveTranscript(current.heard));
  });

  useSpeechRecognitionEvent("error", ({ error }) => {
    const current = attempt.current;
    if (current?.stage === "starting") current.stage = "failed";
    else if (current?.stage !== "live") return;
    const next = recognitionFailure(error);
    if (next) setFailure(next);
    else current.dropped = true;
  });

  useSpeechRecognitionEvent("nomatch", () => {
    if (attempt.current?.stage === "live") setFailure("no_speech");
  });

  useSpeechRecognitionEvent("end", () => {
    const current = attempt.current;
    if (current?.stage !== "live" && current?.stage !== "failed") return;
    finish();
    releaseAudioSession();
    const text = finalTranscript(current.heard);
    if (!text || current.dropped) return;
    // iOS can report hearing nothing after it heard words; what was sent wins.
    setFailure(null);
    onFinalRef.current(text);
  });

  const start = useCallback(() => {
    if (!supported || onDevice === null || attempt.current) return;
    const current: SpeechAttempt = { stage: "asking", pending: null, dropped: false, heard: NOTHING_HEARD };
    attempt.current = current;
    setFailure(null);
    setInterim("");
    setListening(true);
    void (async () => {
      try {
        const { granted } = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
        // Stopped, or the screen closed, while the phone was asking.
        if (attempt.current !== current) return;
        if (!granted) {
          finish();
          setFailure("denied");
          return;
        }
        // An attempt left behind by a closed screen would take this one's events: wait for its end.
        await orphanedAttemptEnded();
        if (attempt.current !== current) return;
        current.stage = "starting";
        ExpoSpeechRecognitionModule.start(recognitionOptions(locale, onDevice));
      } catch (error) {
        couldNotListen(error);
        if (attempt.current !== current) return;
        finish();
        setFailure("unavailable");
      }
    })();
  }, [finish, locale, onDevice, supported]);

  /** iOS can fail to start with an error and no end: listening is over either way. */
  const giveUp = useCallback(() => {
    finish();
    releaseAudioSession();
  }, [finish]);

  const stop = useCallback(() => {
    const current = attempt.current;
    if (current?.stage === "asking") finish();
    else if (current?.stage === "failed") giveUp();
    else if (current?.stage === "starting") current.pending ??= "stop";
    else if (current?.stage === "live") ExpoSpeechRecognitionModule.stop();
  }, [finish, giveUp]);

  const abort = useCallback(() => {
    const current = attempt.current;
    if (!current) return;
    current.dropped = true;
    if (current.stage === "asking") finish();
    else if (current.stage === "failed") giveUp();
    else if (current.stage === "starting") current.pending = "abort";
    else ExpoSpeechRecognitionModule.abort();
  }, [finish, giveUp]);

  useEffect(
    () => () => {
      const current = attempt.current;
      attempt.current = null;
      // Never sent to the phone, or failed to start there: nothing to wait for.
      if (current?.stage === "failed") releaseAudioSession();
      else if (current?.stage === "starting" || current?.stage === "live") abortOrphanedAttempt(current);
    },
    [],
  );

  const clearFailure = useCallback(() => setFailure(null), []);

  const recheckPermission = useCallback(() => {
    if (failure !== "denied") return;
    void ExpoSpeechRecognitionModule.getPermissionsAsync()
      .then(({ granted }) => {
        if (granted) clearFailure();
      })
      .catch(couldNotListen);
  }, [clearFailure, failure]);

  useOnResume(recheckPermission, RECHECK_PERMISSION_MS);

  return { supported, listening, interim, failure, start, stop, abort, clearFailure };
}
