import type { StreamTurnOptions } from "./stream-turn-options";

/**
 * Sends one turn and delivers its events; resolves when the stream closes and
 * throws ``TurnRequestError`` when the turn is refused before streaming. Each
 * platform builds one with ``createStreamTurn``.
 */
export type StreamTurnFn = (options: StreamTurnOptions) => Promise<void>;
