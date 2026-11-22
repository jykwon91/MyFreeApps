import { Smartphone } from "lucide-react";
import { DEVICE_SESSION_MESSAGES, signOutDeviceLabel } from "@platform/core/constants/deviceSessions";
import { deviceDisplayName } from "@platform/core/utils/deviceName";
import { formatLastUsed, formatSignedInDate } from "@platform/core/utils/formatDeviceTimes";
import LoadingButton from "../ui/LoadingButton";
import type { SignedInDeviceRowProps } from "../../types/signed-in-device-row-props";

export default function SignedInDeviceRow({ device, isSigningOut, onSignOut }: SignedInDeviceRowProps) {
  const name = deviceDisplayName(device);

  return (
    <li className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-md border p-3">
      <div className="flex items-start gap-3 min-w-0">
        <Smartphone aria-hidden="true" className="h-5 w-5 shrink-0 text-muted-foreground mt-0.5" />
        <div className="min-w-0">
          <p className="text-sm font-medium break-words">{name}</p>
          <p className="text-sm text-muted-foreground">{formatLastUsed(device.last_used_at)}</p>
          <p className="text-xs text-muted-foreground">{formatSignedInDate(device.created_at)}</p>
        </div>
      </div>
      <LoadingButton
        aria-label={signOutDeviceLabel(name)}
        className="shrink-0"
        isLoading={isSigningOut}
        loadingText={DEVICE_SESSION_MESSAGES.signingOut}
        onClick={onSignOut}
        size="sm"
        variant="secondary"
      >
        {DEVICE_SESSION_MESSAGES.signOut}
      </LoadingButton>
    </li>
  );
}
