import type { AccountMessage } from "../types/AccountMessage";

export const SIGNED_OUT_MESSAGE: AccountMessage = { message: "You're signed out.", variant: "success" };

/** The phone is signed out locally, but the server never heard about it. */
export const SIGNED_OUT_OFFLINE_MESSAGE: AccountMessage = {
  message:
    "Signed out on this phone. We couldn't reach the server, so this phone may still appear in your device list. Sign out of it from another device.",
  variant: "error",
};
