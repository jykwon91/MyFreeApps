import type { StatusTone } from "../status-tone";

/** What a discovered posting's card shows, worked out once for the website and the phone. */
export interface DiscoveredJobFacts {
  /** "Remote", "Hybrid" or "On-site"; null when the posting doesn't say. */
  remoteLabel: string | null;
  salaryLabel: string | null;
  /** Like "2 hours ago". */
  postedLabel: string | null;
  verdictLabel: string | null;
  verdictTone: StatusTone;
  /** No score and no verdict yet. */
  isUnscored: boolean;
  /** Scored before the profile last changed, so it will be scored again. */
  isScoreStale: boolean;
  isSaved: boolean;
  isPromoted: boolean;
  /** The saved search it came from, when that is known. */
  sourceName: string | null;
}
