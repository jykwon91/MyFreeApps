/**
 * The subset of the Web Speech API recognition interface this app uses.
 * TypeScript's DOM lib ships the result types but not the (still-prefixed)
 * ``SpeechRecognition`` constructor, so it is declared here.
 */
export interface RecognitionAlternative {
  readonly transcript: string;
}

export interface RecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  readonly [index: number]: RecognitionAlternative;
}

export interface RecognitionResultList {
  readonly length: number;
  readonly [index: number]: RecognitionResult;
}

export interface RecognitionResultEvent {
  readonly resultIndex: number;
  readonly results: RecognitionResultList;
}

export interface RecognitionErrorEvent {
  readonly error: string;
}

export interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: RecognitionResultEvent) => void) | null;
  onerror: ((event: RecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

export type RecognitionConstructor = new () => Recognition;
