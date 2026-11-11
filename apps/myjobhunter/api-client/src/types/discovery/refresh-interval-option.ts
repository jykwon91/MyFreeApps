/** One preset of how often a saved search fetches on its own. */
export interface RefreshIntervalOption {
  /** Backend ``fetch_interval_minutes`` value. */
  minutes: number;
  /** Human-readable label for the picker. */
  label: string;
  /** Short form used in a saved search's schedule line. */
  short: string;
}
