import { createAuthClient } from "@platform/ui/lib/authClient";
import { store } from "@/lib/store";

const authClient = createAuthClient(store);
// Hot reload runs this module again; dispose the old client so its cache reset doesn't stay registered.
import.meta.hot?.dispose(authClient.dispose);

export const {
  signIn,
  register,
  requestVerifyToken,
  forgotPassword,
  resetPassword,
  signOut,
} = authClient;
