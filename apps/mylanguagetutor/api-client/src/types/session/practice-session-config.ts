import type { Level } from "../tutor/level";
import type { StreamTurnFn } from "../stream/stream-turn-fn";

export interface PracticeSessionConfig {
  languageCode: string;
  ttsLocale: string;
  scenarioSlug: string;
  level: Level;
  /** The platform's turn stream (``createStreamTurn``); keep it stable across renders. */
  streamTurn: StreamTurnFn;
  /** Queue a finished sentence for speech. */
  speak: (sentence: string) => void;
  /** Stop any speech in progress (a new turn barges in). */
  stopSpeaking: () => void;
  /** Stop any speech, then read ``text`` from the start at ``rate`` (replaying a reply). */
  speakAll: (text: string, rate: number) => void;
}
