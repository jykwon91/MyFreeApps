/** A writ's turn-in spot, ready to show. */
export interface WritTurnInSummary {
  zone: string;
  /** e.g. "45.2, 61.8". */
  coords: string;
  /** The date it was seen, formatted for the provenance badge. */
  seenOn: string;
}
