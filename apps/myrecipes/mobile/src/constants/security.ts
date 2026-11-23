import type { MoreMenuItem, SecurityScreenContent } from "@platform/mobile";
import { ACCOUNT_COPY } from "@myrecipes/api-client/constants/accountCopy";

export const SECURITY_ROUTE = "/security";
export const SECURITY_TURN_ON_ROUTE = "/security/turn-on";
export const DELETE_ACCOUNT_ROUTE = "/delete-account";
export const SETTINGS_ROUTE = "/settings";
export const SECURITY_BACK_TITLE = "Settings";

/** Settings' way into Security, which the website keeps at /security. */
export const SECURITY_MENU_ITEM: MoreMenuItem = { label: "Security", webPath: SECURITY_ROUTE, screen: SECURITY_ROUTE };

/** Where the phone remembers the two-step intro was dismissed. */
export const SECURITY_INTRO_DISMISSED_KEY = "myrecipes_security_info_dismissed";

export const SECURITY_CONTENT: SecurityScreenContent = {
  intro: ACCOUNT_COPY.twoFactorIntro,
  whatTwoStepProtects: "your recipes and cook logs",
  displayNameDescription: "Shown in your profile and on exported data.",
  exportDescription: ACCOUNT_COPY.exportDescription,
};
