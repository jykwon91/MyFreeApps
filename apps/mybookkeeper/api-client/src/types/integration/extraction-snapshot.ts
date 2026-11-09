/** Which queue items an observer last saw extracting, and which had reached a terminal status. */
export interface ExtractionSnapshot {
  extractingIds: ReadonlySet<string>;
  terminalIds: ReadonlySet<string>;
  /** False until the first observation, which only sets the baseline. */
  seeded: boolean;
}
