/** Where the browser keeps the Discover reminder to add a resume or skills once it is dismissed. */
export const PROFILE_BANNER_DISMISSED_STORAGE_KEY = "mjh_discover_profile_banner_dismissed";

/** Where the browser keeps the Security page's two-step intro once it is dismissed. */
export const SECURITY_INTRO_DISMISSED_STORAGE_KEY = "mjh-security-info-dismissed";

/** Where the browser keeps the resume refinement click-to-target tip once it is dismissed. */
export const RESUME_CLICK_TIP_DISMISSED_STORAGE_KEY = "mjh:resumeRefinementClickTipDismissed";

/** Each board lane's fold is kept under this prefix plus the lane's name. */
export const KANBAN_LANE_STORAGE_PREFIX = "mjh_kanban_lane_";

/** Every browser key that holds one account's own choices, which the next account to sign in shouldn't inherit. */
export const ACCOUNT_PREFERENCE_STORAGE_KEYS = [
  PROFILE_BANNER_DISMISSED_STORAGE_KEY,
  SECURITY_INTRO_DISMISSED_STORAGE_KEY,
  RESUME_CLICK_TIP_DISMISSED_STORAGE_KEY,
] as const;
