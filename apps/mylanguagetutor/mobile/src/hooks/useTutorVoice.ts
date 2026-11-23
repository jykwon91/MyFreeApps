import { useSpeechQueue } from "@mylanguagetutor/api-client/hooks/useSpeechQueue";
import type { QueuedSentence } from "@mylanguagetutor/api-client/types/speech/queued-sentence";
import type { SpeechQueueControls } from "@mylanguagetutor/api-client/types/speech/speech-queue-controls";
import * as Speech from "expo-speech";
import type { SpeechOptions } from "expo-speech";
import { useCallback, useEffect, useRef } from "react";
import { NO_VOICES, USE_APPLICATION_AUDIO_SESSION } from "../constants/speech";
import { speechLanguage } from "../utils/speechLanguage";
import { voiceIdForLocale } from "../utils/voiceIdForLocale";

function couldNotSpeak(): void {
  // The reply is still on the screen; only its voice is missing. Never log the sentence itself.
  console.warn("The tutor's voice couldn't speak a sentence.");
}

function fitsTheEngine(text: string): boolean {
  // Android refuses longer text; a tutor sentence never comes close.
  if (text.length <= Speech.maxSpeechInputLength) return true;
  couldNotSpeak();
  return false;
}

function stopSpeech(): void {
  void Speech.stop();
}

/**
 * The tutor's voice, as the website's: sentence by sentence in the target language's best voice, so
 * speech starts before the reply has finished. Without a suitable voice, the phone picks one from the
 * language, as the website's browser does. The chosen voice is read as each sentence is queued, so a
 * voice list that arrives mid-reply applies to the rest of it. When the phone reports it can't speak
 * in the chosen voice, that sentence is tried once without it and the voice is dropped, so the rest
 * is spoken in the phone's pick instead of failing sentence by sentence. The queue itself (speaking,
 * stopping, stopping when the screen goes away) is the website's, from the shared ``useSpeechQueue``.
 */
export function useTutorVoice(locale: string): SpeechQueueControls {
  const voice = useRef<string | undefined>(undefined);

  useEffect(() => {
    let current = true;
    voice.current = undefined;
    // Android's list waits for its engine to start, and is empty if it never does. Listing fails only
    // if the engine throws while listing: then too there's no voice to pick, and the phone picks one.
    void Speech.getAvailableVoicesAsync()
      .catch(() => NO_VOICES)
      .then((voices) => {
        if (current) voice.current = voiceIdForLocale(voices, locale);
      });
    return () => {
      current = false;
    };
  }, [locale]);

  const speak = useCallback(
    (text: string, rate: number, sentence: QueuedSentence) => {
      const failed = () => {
        couldNotSpeak();
        sentence.done();
      };
      const options: SpeechOptions = {
        language: speechLanguage(locale),
        rate,
        useApplicationAudioSession: USE_APPLICATION_AUDIO_SESSION,
        onDone: sentence.done,
        onStopped: sentence.done,
      };
      const chosen = voice.current;
      if (!chosen) {
        Speech.speak(text, { ...options, onError: failed });
        return;
      }
      // The engine reports the failure later, once it reaches the sentence: by then speech may have stopped.
      const withoutVoice = () => {
        if (voice.current === chosen) voice.current = undefined;
        if (sentence.isCurrent()) Speech.speak(text, { ...options, onError: failed });
      };
      Speech.speak(text, { ...options, voice: chosen, onError: withoutVoice });
    },
    [locale],
  );

  return useSpeechQueue(locale, { speak, stop: stopSpeech, canSpeak: fitsTheEngine });
}
