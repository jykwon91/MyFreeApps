import { NOTHING_HEARD } from "@mylanguagetutor/api-client/constants/heardSpeech";
import type { RecognitionFailure } from "@mylanguagetutor/api-client/types/speech/recognition-failure";
import { endedNormally } from "@mylanguagetutor/api-client/utils/endedNormally";
import { finalTranscript } from "@mylanguagetutor/api-client/utils/finalTranscript";
import { keepsHeardSpeech } from "@mylanguagetutor/api-client/utils/keepsHeardSpeech";
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
 * what was heard, as does an error while the learner is still talking: the phone taking the
 * microphone for a call (iOS says interrupted; Android, which has no such signal, says audio-capture
 * or client) must not send half an answer. Running out of speech, or an error once the answer ended
 * normally (the learner asked to send, or a final result arrived), still sends, with no failure shown.
 * The screen closing aborts too. `onDevice` is null until it's known whether
 * the phone recognizes the language on the device; listening waits for that.
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

  /** The phone failed to start with an error, as iOS can with no end after it: listening is over now. */
  const giveUp = useCallback(() => {
    finish();
    releaseAudioSession();
  }, [finish]);

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
    current.anythingHeard = true;
    if (current.heard.finalText) current.settled = true;
    setInterim(liveTranscript(current.heard));
  });

  useSpeechRecognitionEvent("error", ({ error }) => {
    const current = attempt.current;
    if (current?.stage !== "starting" && current?.stage !== "live") return;
    const next = recognitionFailure(error, current);
    if (next) setFailure(next);
    if (!keepsHeardSpeech(error, current)) current.dropped = true;
    // Nothing was recording: its trailing end, if any, finds no attempt and is ignored.
    if (current.stage === "starting") giveUp();
  });

  useSpeechRecognitionEvent("nomatch", () => {
    const current = attempt.current;
    // A stop with nothing heard (Android answers it with a no-match) isn't the learner failing to be heard.
    if (current?.stage === "live" && !endedNormally(current)) setFailure("no_speech");
  });

  useSpeechRecognitionEvent("end", () => {
    const current = attempt.current;
    if (current?.stage !== "live") return;
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
    const current: SpeechAttempt = {
      stage: "asking",
      pending: null,
      anythingHeard: false,
      settled: false,
      stopRequested: false,
      dropped: false,
      heard: NOTHING_HEARD,
    };
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

  const stop = useCallback(() => {
    const current = attempt.current;
    if (!current) return;
    if (current.stage === "asking") {
      finish();
      return;
    }
    current.stopRequested = true;
    if (current.stage === "starting") current.pending ??= "stop";
    else ExpoSpeechRecognitionModule.stop();
  }, [finish]);

  const abort = useCallback(() => {
    const current = attempt.current;
    if (!current) return;
    current.dropped = true;
    if (current.stage === "asking") finish();
    else if (current.stage === "starting") current.pending = "abort";
    else ExpoSpeechRecognitionModule.abort();
  }, [finish]);

  useEffect(
    () => () => {
      const current = attempt.current;
      attempt.current = null;
      if (current?.stage === "starting" || current?.stage === "live") abortOrphanedAttempt(current);
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
