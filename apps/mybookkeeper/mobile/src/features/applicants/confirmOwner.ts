import { authenticateAsync, getEnrolledLevelAsync, SecurityLevel } from "expo-local-authentication";
import { REVEAL_MESSAGES, REVEAL_QUIET_AUTH_ERRORS } from "../../constants/applicantReveal";

/**
 * Face ID, fingerprint or the phone's passcode. A phone with no lock at all has nothing to ask
 * for, so it passes: refusing would lock its owner out of details the website would show them.
 * This only stops someone holding an unlocked phone. The server can't see it happen.
 */
export async function confirmOwner(): Promise<{ confirmed: boolean; problem: string | null }> {
  try {
    if ((await getEnrolledLevelAsync()) === SecurityLevel.NONE) return { confirmed: true, problem: null };
    const result = await authenticateAsync({ promptMessage: REVEAL_MESSAGES.prompt });
    if (result.success) return { confirmed: true, problem: null };
    const isQuiet = REVEAL_QUIET_AUTH_ERRORS.includes(result.error);
    return { confirmed: false, problem: isQuiet ? null : REVEAL_MESSAGES.couldntConfirm };
  } catch {
    return { confirmed: false, problem: REVEAL_MESSAGES.couldntConfirm };
  }
}
