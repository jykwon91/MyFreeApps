/** A page value that starts from the selected character and may be typed over. */
export interface CharacterDefaultState {
  /** "Jason Kwon", for the "Use Jason Kwon's" button. */
  characterName: string;
  /** The player typed a value over the character's own. */
  overridden: boolean;
  /** Back to the character's values. */
  reset: () => void;
}
