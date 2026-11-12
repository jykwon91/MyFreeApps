/** Mirrors backend ``UsageTodayResponse``. Only the caller's own budget. */
export interface UsageToday {
  remaining_fraction: number;
  cap_reached: boolean;
  tutor_available: boolean;
}
