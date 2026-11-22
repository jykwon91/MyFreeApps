import { DEMO_EMAIL_REFUSED } from "../constants/demoRefusal";
import { WELCOME_MANUAL_EMAIL_TOO_MANY } from "../constants/welcomeManualLimits";
import { httpStatus } from "./httpStatus";
import { isDemoRefusal } from "./isDemoRefusal";

/** What the web dialog says when emailing a guide fails outright; the server's own wording is never shown. */
export function welcomeManualEmailFailure(error: unknown): string {
  if (isDemoRefusal(error)) return DEMO_EMAIL_REFUSED;
  if (httpStatus(error) === 429) return WELCOME_MANUAL_EMAIL_TOO_MANY;
  return "I couldn't send that. Want to try again?";
}
