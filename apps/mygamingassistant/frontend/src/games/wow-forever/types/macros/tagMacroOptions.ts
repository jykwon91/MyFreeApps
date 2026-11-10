/** What the tag macro is built from. */
export interface TagMacroOptions {
  /** Exact mob names, already cleaned up by `parseMobNames`. */
  mobs: readonly string[];
  spell: string;
  /** Put a skull on the mob before casting. */
  skull: boolean;
}
