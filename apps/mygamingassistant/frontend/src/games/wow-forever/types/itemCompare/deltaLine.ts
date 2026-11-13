/** One line of a compare list: "+12 Stamina" (a gain) or "−3 Intellect" (a loss). */
export interface DeltaLine {
  key: string;
  text: string;
  gain: boolean;
}
