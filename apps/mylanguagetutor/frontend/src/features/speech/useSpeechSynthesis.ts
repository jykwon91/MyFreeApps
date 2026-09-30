import { useCallback, useEffect, useRef, useState } from "react";
import { hasSpeechSynthesis } from "@/features/speech/speechSupport";
import { createSentenceChunker } from "@/features/speech/sentenceChunker";
import { speakableText } from "@/features/speech/speakableText";
import { voiceForLocale } from "@/features/speech/voiceForLocale";

/** Normal and "slow" speaking rates. Slow is a real lower rate, not a pause. */
export const NORMAL_RATE = 1;
export const SLOW_RATE = 0.7;

export interface SpeechSynthesisControls {
  supported: boolean;
  /** True while any queued sentence is still being spoken. */
  speaking: boolean;
  /** Queue one sentence (glosses / markdown stripped) behind anything already queued. */
  enqueue: (sentence: string, rate?: number) => void;
  /** Stop everything, then read ``text`` from the start. */
  speakAll: (text: string, rate?: number) => void;
  /** Stop speaking now (barge-in). */
  cancel: () => void;
}

/**
 * Sentence-by-sentence text-to-speech in the target language's voice.
 * Speaking sentence by sentence keeps each utterance short (Chrome cuts long
 * utterances off) and lets speech start before the reply has finished.
 */
export function useSpeechSynthesis(locale: string): SpeechSynthesisControls {
  const supported = hasSpeechSynthesis();
  const [voice, setVoice] = useState<SpeechSynthesisVoice | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const pending = useRef(0);
  const generation = useRef(0);
  // Chrome can garbage-collect an in-flight utterance (its onend never
  // fires) unless something holds a reference to it.
  const live = useRef(new Set<SpeechSynthesisUtterance>());

  useEffect(() => {
    if (!supported) return;
    const synth = window.speechSynthesis;
    const pick = () => setVoice(voiceForLocale(synth.getVoices(), locale));
    pick();
    synth.addEventListener("voiceschanged", pick);
    return () => synth.removeEventListener("voiceschanged", pick);
  }, [supported, locale]);

  const cancel = useCallback(() => {
    if (!supported) return;
    generation.current += 1;
    pending.current = 0;
    live.current.clear();
    window.speechSynthesis.cancel();
    setSpeaking(false);
  }, [supported]);

  useEffect(() => cancel, [cancel]);

  const enqueue = useCallback(
    (sentence: string, rate: number = NORMAL_RATE) => {
      if (!supported) return;
      const text = speakableText(sentence);
      if (!text) return;
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = locale;
      if (voice) utterance.voice = voice;
      utterance.rate = rate;
      const myGeneration = generation.current;
      const finished = () => {
        live.current.delete(utterance);
        if (myGeneration !== generation.current) return;
        pending.current = Math.max(0, pending.current - 1);
        if (pending.current === 0) setSpeaking(false);
      };
      utterance.onend = finished;
      utterance.onerror = finished;
      live.current.add(utterance);
      pending.current += 1;
      setSpeaking(true);
      window.speechSynthesis.speak(utterance);
    },
    [supported, locale, voice],
  );

  const speakAll = useCallback(
    (text: string, rate: number = NORMAL_RATE) => {
      cancel();
      const chunker = createSentenceChunker(locale);
      for (const sentence of [...chunker.push(text), ...chunker.flush()]) {
        enqueue(sentence, rate);
      }
    },
    [cancel, enqueue, locale],
  );

  return { supported, speaking, enqueue, speakAll, cancel };
}
