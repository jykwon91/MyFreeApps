import type { TurnRefusal } from "./TurnRefusal";
import type { TurnStream } from "./TurnStream";

/** How the stubbed server answers one POST /sessions/{id}/turns. */
export type TurnScript = TurnStream | TurnRefusal;
