/** Where "nearest" is measured from: a spot on a map, and whether the player said it in the chat or it's their saved location. */
export interface AskOrigin {
  zoneId: number;
  x: number;
  y: number;
  /** "Desolace", "Goldshire, Elwynn Forest". */
  label: string;
  /** True when it came from the player's message — only then does "Route there" carry it as From. */
  fromMessage: boolean;
}
