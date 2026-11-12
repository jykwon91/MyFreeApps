import { NORMAL_RATE } from "@mylanguagetutor/api-client/constants/speechRates";
import { speakableText } from "@mylanguagetutor/api-client/utils/speakableText";
import { spokenSentences } from "@mylanguagetutor/api-client/utils/spokenSentences";
import * as Speech from "expo-speech";
import type { SpeechOptions } from "expo-speech";
import { useCallback, useEffect, useRef, useState } from "react";
import { NO_VOICES, USE_APPLICATION_AUDIO_SESSION } from "../constants/speech";
import type { TutorVoiceControls } from "../types/TutorVoiceControls";
import { speechLanguage } from "../utils/speechLanguage";
import { voiceIdForLocale } from "../utils/voiceIdForLocale";

function couldNotSpeak(): void {
  // The reply is still on the screen; only its voice is missing. Never log the sentence itself.
  console.warn("The tutor's voice couldn't speak a sentence.");
}

/**
 * The tutor's voice, as the website's: sentence by sentence in the target language's best voice, so
 * speech starts before the reply has finished. Without a suitable voice, the phone picks one from the
 * language, as the website's browser does. The chosen voice is read as each sentence is queued, so a
 * voice list that arrives mid-reply applies to the rest of it. When the phone reports it can't speak
 * in the chosen voice, that sentence is tried once without it and the voice is dropped, so the rest
 * is spoken in the phone's pick instead of failing sentence by sentence. Speech stops when the screen
 * goes away. `speaking` is true from the first sentence queued until the last has been said or speech
 * stopped, as the website's.
 */
export function useTutorVoice(locale: string): TutorVoiceControls {
  const voice = useRef<string | undefined>(undefined);
  // Bumped by every stop, so a failed sentence's retry can't speak after it.
  const generation = useRef(0);
  const [speaking, setSpeaking] = useState(false);
  // Sentences queued and not yet said, since the last stop.
  const pending = useRef(0);

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

  const cancel = useCallback(() => {
    generation.current += 1;
    pending.current = 0;
    setSpeaking(false);
    void Speech.stop();
  }, []);

  useEffect(() => cancel, [cancel]);

  const enqueue = useCallback(
    (sentence: string, rate: number = NORMAL_RATE) => {
      const text = speakableText(sentence);
      if (!text) return;
      // Android refuses longer text; a tutor sentence never comes close.
      if (text.length > Speech.maxSpeechInputLength) {
        couldNotSpeak();
        return;
      }
      const queuedIn = generation.current;
      const said = () => {
        if (queuedIn !== generation.current) return;
        pending.current = Math.max(0, pending.current - 1);
        if (pending.current === 0) setSpeaking(false);
      };
      const failed = () => {
        couldNotSpeak();
        said();
      };
      const options: SpeechOptions = {
        language: speechLanguage(locale),
        rate,
        useApplicationAudioSession: USE_APPLICATION_AUDIO_SESSION,
        onDone: said,
        onStopped: said,
      };
      pending.current += 1;
      setSpeaking(true);
      const chosen = voice.current;
      if (!chosen) {
        Speech.speak(text, { ...options, onError: failed });
        return;
      }
      // The engine reports the failure later, once it reaches the sentence: by then speech may have stopped.
      const withoutVoice = () => {
        if (voice.current === chosen) voice.current = undefined;
        if (queuedIn === generation.current) Speech.speak(text, { ...options, onError: failed });
      };
      Speech.speak(text, { ...options, voice: chosen, onError: withoutVoice });
    },
    [locale],
  );

  const speakAll = useCallback(
    (text: string, rate: number) => {
      cancel();
      for (const sentence of spokenSentences(text, locale)) enqueue(sentence, rate);
    },
    [cancel, enqueue, locale],
  );

  return { speaking, enqueue, speakAll, cancel };
}
