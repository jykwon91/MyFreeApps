import { createAuthClient } from "@platform/ui/lib/authClient";
import { store } from "@/lib/store";

export const {
  signIn,
  requestVerifyToken,
  forgotPassword,
  resetPassword,
  signOut,
} = createAuthClient(store);
