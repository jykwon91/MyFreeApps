import { WELCOME_MANUAL_GUIDE_PATH } from "../constants/welcomeManualLimits";

/** The guest URL of a shared manual; `origin` is the site root. */
export function shareUrl(origin: string, shareToken: string): string {
  return `${origin.replace(/\/+$/, "")}${WELCOME_MANUAL_GUIDE_PATH}/${shareToken}`;
}
