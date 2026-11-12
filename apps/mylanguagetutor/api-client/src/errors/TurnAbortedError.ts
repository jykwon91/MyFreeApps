/** The caller aborted the turn: its stream stops, and no more of its events are delivered. */
export class TurnAbortedError extends Error {
  constructor() {
    super("turn aborted");
    this.name = "TurnAbortedError";
  }
}
