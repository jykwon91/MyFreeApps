import { createAuthClient } from "@platform/ui/lib/authClient";
import { store } from "@/lib/store";

export const {
  signIn,
  registerWithDisplayName: register,
  requestVerifyToken,
  forgotPassword,
  resetPassword,
  signOut,
} = createAuthClient(store);
