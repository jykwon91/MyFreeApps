/** How much a member's stat grew, and the stored day it counts from. */
export interface MemberGain {
  value: number;
  /** The baseline day (UTC, "2026-11-12"). */
  since: string;
}
