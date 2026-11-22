import type { SignedInDevice } from "@platform/core/types/security/signed-in-device";

export interface SignedInDeviceRowProps {
  device: SignedInDevice;
  isSigningOut: boolean;
  onSignOut: () => void;
}
