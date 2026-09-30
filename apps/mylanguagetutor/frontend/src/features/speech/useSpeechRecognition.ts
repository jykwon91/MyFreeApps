import { useCallback, useEffect, useRef, useState } from "react";
import { getRecognitionConstructor } from "@/features/speech/speechSupport";
import type { Recognition, RecognitionResultEvent } from "@/types/speech/speech-recognition";
import type { RecognitionFailure } from "@/types/speech/recognition-failure";

const DENIED_ERRORS = new Set(["not-allowed", "service-not-allowed"]);
const IGNORED_ERRORS = new Set(["aborted"]);

export interface SpeechRecognitionControls {
  supported: boolean;
  listening: boolean;
  /** Live (not yet final) transcript while listening. */
  interim: string;
  failure: RecognitionFailure | null;
  /** Open the microphone. The browser asks for permission on first use. */
  start: () => void;
  /** Stop listening; whatever was heard so far is delivered as final. */
  stop: () => void;
  clearFailure: () => void;
}

function readResults(event: RecognitionResultEvent): { finalText: string; interimText: string } {
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
  const heard = useRef("");
  // Some browsers end without promoting the last interim result to final
  // when the learner taps stop; fall back to it rather than lose the turn.
  const lastInterim = useRef("");
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
    heard.current = "";
    lastInterim.current = "";
    rec.onresult = (event) => {
      const { finalText, interimText } = readResults(event);
      heard.current = finalText;
      lastInterim.current = `${finalText}${interimText}`;
      setInterim(`${finalText}${interimText}`);
    };
    rec.onerror = (event) => {
      if (IGNORED_ERRORS.has(event.error)) return;
      if (DENIED_ERRORS.has(event.error)) setFailure("denied");
      else if (event.error === "no-speech") setFailure("no_speech");
      else setFailure("unavailable");
    };
    rec.onend = () => {
      recognition.current = null;
      setListening(false);
      setInterim("");
      const text = (heard.current || lastInterim.current).trim();
      heard.current = "";
      lastInterim.current = "";
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
