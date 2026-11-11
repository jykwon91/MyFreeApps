import { authenticateAsync, getEnrolledLevelAsync, SecurityLevel } from "expo-local-authentication";
import { OWNER_CHECK_MESSAGES, OWNER_CHECK_QUIET_ERRORS } from "../constants/ownerCheck";
import type { OwnerCheck } from "../types/OwnerCheck";

/**
 * Face ID, fingerprint or the phone's passcode. A phone with no lock at all has nothing to ask
 * for, so it passes: refusing would lock its owner out of what the website would let them do.
 * This only stops someone holding an unlocked phone. The server can't see it happen.
 */
export async function confirmOwner(promptMessage: string): Promise<OwnerCheck> {
  try {
    if ((await getEnrolledLevelAsync()) === SecurityLevel.NONE) return { confirmed: true, problem: null };
    const result = await authenticateAsync({ promptMessage });
    if (result.success) return { confirmed: true, problem: null };
    const isQuiet = OWNER_CHECK_QUIET_ERRORS.includes(result.error);
    return { confirmed: false, problem: isQuiet ? null : OWNER_CHECK_MESSAGES.couldntConfirm };
  } catch {
    return { confirmed: false, problem: OWNER_CHECK_MESSAGES.couldntConfirm };
  }
}
