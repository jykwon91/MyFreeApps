import { onAccountLeft } from "@platform/ui";
import { createAuthClient } from "@platform/ui/lib/authClient";
import { forgetAccountPreferences } from "@/lib/forgetAccountPreferences";
import { forgetResumeSession } from "@/lib/resumeSessionStorage";
import { store } from "@/lib/store";

const authClient = createAuthClient(store);
// Hot reload runs this module again; dispose the old client so its cache reset doesn't stay registered.
import.meta.hot?.dispose(authClient.dispose);
// The refinement session belongs to the account that started it; the next one would only find it
// gone. An expired session keeps it: there's no list to find it again by, and the same person
// signing back in picks up where they were.
const stopForgettingResumeSession = onAccountLeft(forgetResumeSession);
import.meta.hot?.dispose(stopForgettingResumeSession);
// Dismissed reminders and folded board lanes are that account's own choices too. Unlike the
// session, an expired one keeps them for the same person: onAccountLeft doesn't fire for that.
const stopForgettingPreferences = onAccountLeft(forgetAccountPreferences);
import.meta.hot?.dispose(stopForgettingPreferences);

export const {
  signIn,
  register,
  requestVerifyToken,
  forgotPassword,
  resetPassword,
  signOut,
} = authClient;
