/** A turn the server never answers: the connection stays open with nothing on it, as when a phone changes networks. */
export interface UnansweredTurn {
  kind: "unanswered";
}
