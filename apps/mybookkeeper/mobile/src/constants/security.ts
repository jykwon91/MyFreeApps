import type { SecurityScreenContent } from "@platform/mobile";

export const APP_NAME = "MyBookkeeper";
export const SECURITY_ROUTE = "/security";
export const SECURITY_TURN_ON_ROUTE = "/security/turn-on";
export const DELETE_ACCOUNT_ROUTE = "/delete-account";
export const SECURITY_BACK_TITLE = "More";

/** Where the phone remembers the two-step intro was dismissed. */
export const SECURITY_INTRO_DISMISSED_KEY = "mbk_security_info_dismissed";

export const SECURITY_CONTENT: SecurityScreenContent = {
  intro:
    "Two-step sign-in adds an extra layer of security to your account. I recommend turning it on, since your account holds sensitive financial data.",
  whatTwoStepProtects: "your books",
  displayNameDescription:
    "Shown to tenants on rent receipts and outbound emails. Use the legal name (or business name) you want tenants to see.",
  exportDescription: "A JSON copy of this workspace's properties, documents metadata, transactions, and integrations status.",
};
