import type { TurnByteStream } from "@mylanguagetutor/api-client/types/stream/turn-byte-stream";

/** A reply the test writes event by event, as the server streams it. */
export interface FakeTurnStream {
  /** Writes one SSE event. */
  emit: (event: string, data: object) => void;
  /** The server finished the reply. */
  close: () => void;
  /** The connection broke mid-reply. */
  fail: () => void;
  /** Whether the screen stopped reading it. */
  isAborted: () => boolean;
  /** For the fake fetch: the body the screen reads, which stops when `signal` aborts. */
  open: (signal: AbortSignal | undefined) => TurnByteStream;
}
