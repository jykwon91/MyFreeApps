/** Our own page for a row: an item page, a quest page, a talent in the calculator, or a World Map zone. */
export type ChangeLink =
  | readonly ["item", number]
  | readonly ["quest", number]
  | readonly ["talent", string, number]
  | readonly ["map", number];
