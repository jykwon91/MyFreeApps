import {
  DEVICE_SESSION_MESSAGES,
  deviceSignedOutMessage,
  deviceSignOutFailedMessage,
  deviceSignOutUnsureMessage,
} from "../constants/deviceSessions";
import type { DeviceSignOutMessage } from "../types/security/device-sign-out-message";
import type { DeviceSignOutOutcome } from "../types/security/device-sign-out-outcome";

/** `outcome` is null when signing out failed (useDevices' signOutDevice rejected). */
export function deviceSignOutMessage(outcome: DeviceSignOutOutcome | null, name: string): DeviceSignOutMessage {
  switch (outcome) {
    case "signedOut":
      return { message: deviceSignedOutMessage(name), variant: "success" };
    case "alreadyGone":
      return { message: DEVICE_SESSION_MESSAGES.alreadyGone, variant: "success" };
    case "unsure":
      return { message: deviceSignOutUnsureMessage(name), variant: "error" };
    case null:
      return { message: deviceSignOutFailedMessage(name), variant: "error" };
  }
}
