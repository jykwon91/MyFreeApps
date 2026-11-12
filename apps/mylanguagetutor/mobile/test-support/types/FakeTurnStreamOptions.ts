import type { FakeTurnEvent } from "./FakeTurnEvent";

export interface FakeTurnStreamOptions {
  /**
   * An event that reaches the phone just as the screen stops the turn: the read that carries it
   * finishes after the abort. Otherwise a read stops as soon as the screen aborts.
   */
  arrivesAsStopped?: FakeTurnEvent;
}
