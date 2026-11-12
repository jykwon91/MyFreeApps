import type { TurnStreamEvent } from "../tutor/turn-stream-event";

/** Receives each tutor event of a turn as it arrives. */
export type TurnEventHandler = (event: TurnStreamEvent) => void;
