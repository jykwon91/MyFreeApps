import { DASHBOARD_FOLDS_KEY } from "./dashboard";
import { PROFILE_BANNER_DISMISSED_KEY } from "./profileBanner";
import { SECURITY_INTRO_DISMISSED_KEY } from "./security";

/** Every key holding one account's own choices, which the next account to sign in on the phone shouldn't inherit. */
export const ACCOUNT_PREFERENCE_KEYS: readonly string[] = [
  PROFILE_BANNER_DISMISSED_KEY,
  SECURITY_INTRO_DISMISSED_KEY,
  DASHBOARD_FOLDS_KEY,
];
