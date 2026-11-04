import type { SignedInDevice } from "../types/SignedInDevice";

export function deviceDisplayName(device: SignedInDevice): string {
  return device.device_name?.trim() || "Unknown device";
}
