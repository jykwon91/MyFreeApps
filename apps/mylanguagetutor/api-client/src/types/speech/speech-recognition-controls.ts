import type { RecognitionFailure } from "./recognition-failure";

/** One utterance of speech recognition, as the practice screen drives it on the website and the phone. */
export interface SpeechRecognitionControls {
  supported: boolean;
  listening: boolean;
  /** Live (not yet final) transcript while listening. */
  interim: string;
  failure: RecognitionFailure | null;
  /** Open the microphone. The browser or phone asks for permission on first use. */
  start: () => void;
  /** Stop listening; whatever was heard so far is delivered as final. */
  stop: () => void;
  clearFailure: () => void;
}
