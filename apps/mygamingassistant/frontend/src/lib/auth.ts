import { createAuthClient } from "@platform/ui/lib/authClient";
import { store } from "@/lib/store";
import { flushPendingWrites } from "@/lib/pendingWrites";

const authClient = createAuthClient(store);
// Hot reload runs this module again; dispose the old client so its cache reset doesn't stay registered.
import.meta.hot?.dispose(authClient.dispose);

export const {
  signIn,
  requestVerifyToken,
  forgotPassword,
  resetPassword,
  signOut,
} = authClient;

/** Every Sign out button: send held-back writes (lib/pendingWrites.ts) while the session is valid, then sign out. */
export async function signOutAfterSaving(): Promise<void> {
  await flushPendingWrites();
  signOut();
}
