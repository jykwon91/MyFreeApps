import { DEVICE_SESSION_MESSAGES } from "../constants/deviceSessions";
import type { SignedInDevice } from "../types/security/signed-in-device";

export function deviceDisplayName(device: SignedInDevice): string {
  return device.device_name?.trim() || DEVICE_SESSION_MESSAGES.unknownDevice;
}
