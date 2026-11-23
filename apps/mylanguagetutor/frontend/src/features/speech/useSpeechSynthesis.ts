import { useCallback, useEffect, useRef } from "react";
import { hasSpeechSynthesis } from "@/features/speech/speechSupport";
import { useSpeechQueue } from "@mylanguagetutor/api-client/hooks/useSpeechQueue";
import { voiceForLocale } from "@mylanguagetutor/api-client/utils/voiceForLocale";
import type { QueuedSentence } from "@mylanguagetutor/api-client/types/speech/queued-sentence";
import type { SpeechSynthesisControls } from "@/types/speech/speech-synthesis-controls";

/**
 * Sentence-by-sentence text-to-speech in the target language's voice.
 * Speaking sentence by sentence keeps each utterance short (Chrome cuts long
 * utterances off) and lets speech start before the reply has finished.
 */
export function useSpeechSynthesis(locale: string): SpeechSynthesisControls {
  const supported = hasSpeechSynthesis();
  // A ref, so a voice that finishes loading mid-turn is used by the next sentence.
  const voice = useRef<SpeechSynthesisVoice | null>(null);
  // Chrome can garbage-collect an in-flight utterance (its onend never
  // fires) unless something holds a reference to it.
  const live = useRef(new Set<SpeechSynthesisUtterance>());

  useEffect(() => {
    if (!supported) return;
    const synth = window.speechSynthesis;
    const pick = () => {
      voice.current = voiceForLocale(synth.getVoices(), locale);
    };
    pick();
    synth.addEventListener("voiceschanged", pick);
    return () => synth.removeEventListener("voiceschanged", pick);
  }, [supported, locale]);

  const canSpeak = useCallback(() => supported, [supported]);

  const stop = useCallback(() => {
    if (!supported) return;
    live.current.clear();
    window.speechSynthesis.cancel();
  }, [supported]);

  const speak = useCallback(
    (text: string, rate: number, sentence: QueuedSentence) => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = locale;
      if (voice.current) utterance.voice = voice.current;
      utterance.rate = rate;
      const finished = () => {
        live.current.delete(utterance);
        sentence.done();
      };
      utterance.onend = finished;
      utterance.onerror = finished;
      live.current.add(utterance);
      window.speechSynthesis.speak(utterance);
    },
    [locale],
  );

  const queue = useSpeechQueue(locale, { speak, stop, canSpeak });
  return { supported, ...queue };
}
