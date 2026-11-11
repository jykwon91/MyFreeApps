/** Copy for the reminder that postings can't be scored without a resume or skills. */
export const PROFILE_BANNER_MESSAGES = {
  heading: "Add your resume to see match scores",
  body: "Without a resume or skills, MyJobHunter can't rank discovered postings. Add either to start seeing match scores.",
  setUp: "Set up profile",
  setUpHint: "Opens your profile on the website",
  dismiss: "Dismiss this banner",
} as const;

/** Where the phone remembers the reminder was dismissed. */
export const PROFILE_BANNER_DISMISSED_KEY = "mjh_discover_profile_banner_dismissed";

/** The website page the reminder opens. */
export const PROFILE_WEB_PATH = "/profile";
