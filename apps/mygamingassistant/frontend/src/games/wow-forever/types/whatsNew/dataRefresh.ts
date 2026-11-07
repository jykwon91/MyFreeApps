/** `data/dataRefresh.json`: written by `python -m scripts.wow_refresh apply`, never by hand. */
export interface DataRefresh {
  /** The Forever client build the generated data comes from, e.g. "1.60.1.70790". */
  clientBuild: string;
  /** The day the refresh ran, `YYYY-MM-DD` (UTC). */
  refreshedOn: string;
}
