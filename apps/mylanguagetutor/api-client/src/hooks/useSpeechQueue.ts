import { useCallback, useEffect, useRef, useState } from "react";
import { NORMAL_RATE } from "../constants/speechRates";
import { speakableText } from "../utils/speakableText";
import { spokenSentences } from "../utils/spokenSentences";
import type { QueuedSentence } from "../types/speech/queued-sentence";
import type { SpeechEngine } from "../types/speech/speech-engine";
import type { SpeechQueueControls } from "../types/speech/speech-queue-controls";

/**
 * The tutor's voice as a queue of sentences, on the website and the phone: each passes its own
 * engine. ``speaking`` is true from the first sentence queued until the last has been said, failed
 * or speech stopped. Every stop starts the queue afresh: a sentence queued before it can no longer
 * change ``speaking``, and its engine can ask ``isCurrent`` before trying it again. Speech stops when
 * the screen goes away.
 */
export function useSpeechQueue(locale: string, { speak, stop, canSpeak }: SpeechEngine): SpeechQueueControls {
  const [speaking, setSpeaking] = useState(false);
  // Bumped by every stop, so a sentence queued before it is ignored after it.
  const generation = useRef(0);
  // Sentences queued and not yet said, since the last stop.
  const pending = useRef(0);

  const cancel = useCallback(() => {
    generation.current += 1;
    pending.current = 0;
    stop();
    setSpeaking(false);
  }, [stop]);

  useEffect(() => cancel, [cancel]);

  const enqueue = useCallback(
    (sentence: string, rate: number = NORMAL_RATE) => {
      const text = speakableText(sentence);
      if (!text || !canSpeak(text)) return;
      const queuedIn = generation.current;
      const queued: QueuedSentence = {
        isCurrent: () => queuedIn === generation.current,
        done: () => {
          if (queuedIn !== generation.current) return;
          pending.current = Math.max(0, pending.current - 1);
          if (pending.current === 0) setSpeaking(false);
        },
      };
      pending.current += 1;
      setSpeaking(true);
      speak(text, rate, queued);
    },
    [speak, canSpeak],
  );

  const speakAll = useCallback(
    (text: string, rate: number = NORMAL_RATE) => {
      cancel();
      for (const sentence of spokenSentences(text, locale)) enqueue(sentence, rate);
    },
    [cancel, enqueue, locale],
  );

  return { speaking, enqueue, speakAll, cancel };
}
