/** A stretch a ruleset was recorded down, in epoch milliseconds. */
export interface Outage {
  slug: string;
  name: string;
  start: number;
  /** Null while it's still down. */
  end: number | null;
}
