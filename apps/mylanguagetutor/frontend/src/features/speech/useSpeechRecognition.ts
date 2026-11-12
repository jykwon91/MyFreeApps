import { useCallback, useEffect, useRef, useState } from "react";
import { getRecognitionConstructor } from "@/features/speech/speechSupport";
import { NOTHING_HEARD } from "@mylanguagetutor/api-client/constants/heardSpeech";
import { finalTranscript } from "@mylanguagetutor/api-client/utils/finalTranscript";
import { liveTranscript } from "@mylanguagetutor/api-client/utils/liveTranscript";
import { recognitionFailure } from "@mylanguagetutor/api-client/utils/recognitionFailure";
import type { Recognition, RecognitionResultEvent } from "@/types/speech/speech-recognition";
import type { HeardSpeech } from "@mylanguagetutor/api-client/types/speech/heard-speech";
import type { RecognitionFailure } from "@mylanguagetutor/api-client/types/speech/recognition-failure";
import type { SpeechRecognitionControls } from "@mylanguagetutor/api-client/types/speech/speech-recognition-controls";

function readResults(event: RecognitionResultEvent): HeardSpeech {
  let finalText = "";
  let interimText = "";
  for (let i = 0; i < event.results.length; i += 1) {
    const result = event.results[i];
    const transcript = result[0]?.transcript ?? "";
    if (result.isFinal) finalText += transcript;
    else interimText += transcript;
  }
  return { finalText, interimText };
}

/**
 * One utterance of browser speech recognition (Web Speech API).
 * ``onFinal`` receives the recognised text once the learner stops talking.
 * Chrome sends the audio to Google, Safari to Apple -- see PrivacyNotice.
 */
export function useSpeechRecognition(
  locale: string,
  onFinal: (text: string) => void,
): SpeechRecognitionControls {
  const ctor = getRecognitionConstructor();
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [failure, setFailure] = useState<RecognitionFailure | null>(null);
  const recognition = useRef<Recognition | null>(null);
  const heard = useRef<HeardSpeech>(NOTHING_HEARD);
  const onFinalRef = useRef(onFinal);

  useEffect(() => {
    onFinalRef.current = onFinal;
  }, [onFinal]);

  useEffect(() => () => recognition.current?.abort(), []);

  const start = useCallback(() => {
    if (!ctor || recognition.current) return;
    const rec = new ctor();
    rec.lang = locale;
    rec.continuous = false;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    heard.current = NOTHING_HEARD;
    rec.onresult = (event) => {
      heard.current = readResults(event);
      setInterim(liveTranscript(heard.current));
    };
    rec.onerror = (event) => {
      const next = recognitionFailure(event.error);
      if (next) setFailure(next);
    };
    rec.onend = () => {
      recognition.current = null;
      setListening(false);
      setInterim("");
      const text = finalTranscript(heard.current);
      heard.current = NOTHING_HEARD;
      if (text) onFinalRef.current(text);
    };
    recognition.current = rec;
    setFailure(null);
    setInterim("");
    setListening(true);
    try {
      rec.start();
    } catch {
      recognition.current = null;
      setListening(false);
      setFailure("unavailable");
    }
  }, [ctor, locale]);

  const stop = useCallback(() => {
    recognition.current?.stop();
  }, []);

  const clearFailure = useCallback(() => setFailure(null), []);

  return { supported: ctor !== null, listening, interim, failure, start, stop, clearFailure };
}
