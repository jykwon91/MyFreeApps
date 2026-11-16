/** Where you are in a quest line. */
export interface QuestLineStatus {
  /** Steps ticked as done. */
  doneCount: number;
  /** The index in `steps` of the next one to do; null when every step is done. */
  nextIndex: number | null;
}
