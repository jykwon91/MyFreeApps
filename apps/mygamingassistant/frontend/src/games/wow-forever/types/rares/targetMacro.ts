/** One in-game macro of `/target` lines, and how many of the game's 255 characters it uses. */
export interface TargetMacro {
  text: string;
  length: number;
  /** The rares it targets, in order. */
  names: readonly string[];
}
