import type { TurnRefusal } from "./TurnRefusal";
import type { TurnStream } from "./TurnStream";
import type { UnansweredTurn } from "./UnansweredTurn";

/** How the stubbed server answers one POST /sessions/{id}/turns. */
export type TurnScript = TurnStream | TurnRefusal | UnansweredTurn;
