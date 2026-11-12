/** One socket of the character's gear, in the game's paper-doll order. */
export interface PaperDollSlot {
  /** Blizzard's slot type: HEAD, FINGER_1, MAIN_HAND… */
  slot: string;
  label: string;
}
