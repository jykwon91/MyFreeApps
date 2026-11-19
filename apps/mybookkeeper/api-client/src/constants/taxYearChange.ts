/**
 * Asking which tax year a transaction files under after its date moves to another year,
 * shared by the website and the phone so both ask the same question.
 */
export const TAX_YEAR_CHOICE = {
  move: "move",
  keep: "keep",
  cancel: "cancel",
} as const;

export const TAX_YEAR_CHANGE_MESSAGES = {
  title: (newYear: number) => `Move it to tax year ${newYear}?`,
  body: (currentYear: number, newYear: number) =>
    `The new date is in ${newYear}, but this is filed under tax year ${currentYear}. That decides which year's tax report it shows up in.`,
  keepEditing: "Keep editing",
  keep: (currentYear: number) => `Keep ${currentYear}`,
  move: (newYear: number) => `Move to ${newYear}`,
} as const;
