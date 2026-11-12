import type { SecurityScreenContent } from "@platform/mobile";

export const SECURITY_ROUTE = "/security";
export const SECURITY_TURN_ON_ROUTE = "/security/turn-on";
export const DELETE_ACCOUNT_ROUTE = "/delete-account";
export const SECURITY_BACK_TITLE = "More";

/** Where the phone remembers the two-step intro was dismissed. */
export const SECURITY_INTRO_DISMISSED_KEY = "mjh_security_info_dismissed";

export const SECURITY_CONTENT: SecurityScreenContent = {
  intro:
    "Two-step sign-in adds an extra layer of security to your account. I recommend turning it on to protect your job applications and personal data.",
  whatTwoStepProtects: "your job applications and personal data",
  displayNameDescription: "Shown in your profile and on exported data. Use the name you want employers and contacts to see.",
  exportDescription: "A JSON copy of your profile, applications, companies, documents, and connected job-board metadata.",
};
