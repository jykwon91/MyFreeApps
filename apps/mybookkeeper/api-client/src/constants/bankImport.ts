/** The server turns away a bank statement bigger than this (backend MAX_CSV_SIZE). */
export const BANK_CSV_MAX_BYTES = 5 * 1024 * 1024;

export const BANK_CSV_MAX_LABEL = "5 MB";

export const BANK_IMPORT_FAILURE_MESSAGES = {
  tooLarge: `That file is too big. Bank statements can be up to ${BANK_CSV_MAX_LABEL}, so try a shorter date range.`,
  unreadable: "I couldn't find transactions in that file. Use a CSV downloaded from your bank, such as Chase, Wells Fargo or Bank of America.",
  notCsv: "That file isn't a CSV. Download the statement from your bank as a CSV.",
  unsure: "I didn't hear back, so I'm not sure the statement was imported. It's safe to try again: transactions that are already in are skipped, not added twice.",
  other: "That didn't go through, so nothing was imported. Want to try again?",
} as const;
