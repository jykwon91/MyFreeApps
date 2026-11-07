import { createAuthClient } from "@platform/ui/lib/authClient";
import { store } from "@/lib/store";
import { flushPendingWrites } from "@/lib/pendingWrites";

export const {
  signIn,
  requestVerifyToken,
  forgotPassword,
  resetPassword,
  signOut,
} = createAuthClient(store);

/** Every Sign out button: send held-back writes (lib/pendingWrites.ts) while the session is valid, then sign out. */
export async function signOutAfterSaving(): Promise<void> {
  await flushPendingWrites();
  signOut();
}
