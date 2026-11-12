import type { TurnByteStream } from "./turn-byte-stream";

/** The part of a fetch ``Response`` ``createStreamTurn`` reads. */
export interface TurnFetchResponse {
  ok: boolean;
  status: number;
  body: TurnByteStream | null;
  json(): Promise<unknown>;
}
