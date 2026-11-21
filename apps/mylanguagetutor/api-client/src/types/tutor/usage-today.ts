/** Mirrors backend ``UsageTodayResponse``. Only the caller's own budget. */
export interface UsageToday {
  remaining_fraction: number;
  cap_reached: boolean;
  tutor_available: boolean;
  /** The asked-about conversation has used all its turns; false when no session id was given. */
  session_limit_reached: boolean;
}
