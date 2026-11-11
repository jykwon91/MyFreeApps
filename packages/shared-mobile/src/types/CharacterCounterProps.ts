export interface CharacterCounterProps {
  /** What to show, for example "5,100 / 5,000". */
  counter: string;
  /** Draws it as the error colour once the limit is passed. */
  isOver?: boolean;
}
