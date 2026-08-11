import type { StatDirection } from "@/shared/types/utility/stat-direction";

/** One line of an offer's stat block, already formatted for display. */
export interface OfferStat {
  key: string;
  /** Column heading — "Rate", "Yearly cost". */
  label: string;
  /** The offer's own figure — "10.50¢". */
  value: string;
  /**
   * Movement against the current plan — "5.77¢ less". `null` where the current
   * plan has no comparable figure, or where the stat is a property of the offer
   * rather than a comparison (exit fee, term).
   */
  delta: string | null;
  direction: StatDirection;
  /** Spoken form for screen readers, since colour and arrows carry no meaning. */
  hint: string;
}
