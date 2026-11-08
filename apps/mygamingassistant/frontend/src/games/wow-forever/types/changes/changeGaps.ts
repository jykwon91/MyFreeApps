/** What the generator couldn't compare or name, for the page's "What this doesn't cover". */
export interface ChangeGaps {
  /** Class spell ranks with a value neither book could fill on one side. */
  spellsIncomplete: number;
  spellsNotInClient: number;
  /** New items that are neither gear in the item list, consumables nor recipes. */
  itemsUnlisted: number;
  /** New quests the operator's client cache has no name for yet. */
  questsUnnamed: number;
}
