/** `itemEffects.json`'s `budget`: slot group -> item quality -> item level -> median stat points of no-effect items. */
export type ItemBudgetTable = Record<string, Record<string, Record<string, number>>>;
