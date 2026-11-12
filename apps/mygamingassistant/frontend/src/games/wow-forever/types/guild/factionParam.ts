/** The faction standing board's URL state. */
export interface FactionParam {
  /** `?faction=`; null when absent or not a positive whole number. */
  faction: number | null;
  /** Sets `?faction=` (null removes it); replaces the history entry. */
  setFaction: (id: number | null) => void;
}
