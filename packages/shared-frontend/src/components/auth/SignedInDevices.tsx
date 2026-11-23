import { useEffect, useRef, useState } from "react";
import {
  confirmSignOutDeviceTitle,
  DEVICE_SESSION_MESSAGES,
  devicesDescription,
} from "@platform/core/constants/deviceSessions";
import type { DeviceSignOutMessage } from "@platform/core/types/security/device-sign-out-message";
import type { SignedInDevice } from "@platform/core/types/security/signed-in-device";
import { deviceDisplayName } from "@platform/core/utils/deviceName";
import { deviceSignOutMessage } from "@platform/core/utils/deviceSignOutMessage";
import { devicesInDisplayOrder } from "@platform/core/utils/devicesInDisplayOrder";
import { useDevices } from "../../hooks/useDevices";
import { showError, showSuccess } from "../../lib/toast-store";
import ConfirmDialog from "../ui/ConfirmDialog";
import LoadingButton from "../ui/LoadingButton";
import LoadingRegion from "../ui/LoadingRegion";
import Skeleton from "../ui/Skeleton";
import SignedInDeviceRow from "./SignedInDeviceRow";
import type { SignedInDevicesProps } from "../../types/signed-in-devices-props";

/**
 * The phones and tablets signed in to the account, each with Sign out, so someone who
 * loses their phone can end its session from the website. The website's own sign-in
 * isn't one of them: the list comes from the phone sign-in sessions.
 */
export default function SignedInDevices({ appName }: SignedInDevicesProps) {
  const { devices, hasError, reload, signOutDevice } = useDevices();
  // The device stays remembered after the dialog closes, so its title keeps the name while it goes.
  const [confirming, setConfirming] = useState<SignedInDevice | null>(null);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [signingOutId, setSigningOutId] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function retry(): Promise<void> {
    setIsRetrying(true);
    try {
      await reload();
    } finally {
      setIsRetrying(false);
    }
  }

  async function signOut(device: SignedInDevice): Promise<void> {
    const name = deviceDisplayName(device);
    setSigningOutId(device.id);
    let result: DeviceSignOutMessage;
    try {
      result = deviceSignOutMessage(await signOutDevice(device.id), name);
    } catch {
      result = deviceSignOutMessage(null, name);
    }
    setSigningOutId(null);
    setIsConfirmOpen(false);
    if (result.variant === "success") showSuccess(result.message);
    else showError(result.message);
  }

  function askToSignOut(device: SignedInDevice): void {
    setConfirming(device);
    setIsConfirmOpen(true);
  }

  const confirmingName = confirming ? deviceDisplayName(confirming) : "";

  return (
    <section aria-labelledby="signed-in-devices-heading" className="space-y-4">
      <div>
        <h3 className="font-medium" id="signed-in-devices-heading" ref={headingRef} tabIndex={-1}>
          {DEVICE_SESSION_MESSAGES.heading}
        </h3>
        <p className="text-sm text-muted-foreground mt-0.5">{devicesDescription(appName)}</p>
      </div>

      {devices === null && !hasError ? (
        <LoadingRegion className="space-y-2" label={DEVICE_SESSION_MESSAGES.loading}>
          <Skeleton className="h-[74px] w-full" testId="device-skeleton" />
          <Skeleton className="h-[74px] w-full" testId="device-skeleton" />
        </LoadingRegion>
      ) : null}

      {hasError ? (
        <div className="space-y-2" role="alert">
          <p className="text-sm text-destructive">{DEVICE_SESSION_MESSAGES.loadFailed}</p>
          <LoadingButton
            isLoading={isRetrying}
            loadingText={DEVICE_SESSION_MESSAGES.tryingAgain}
            onClick={() => void retry()}
            size="sm"
            variant="secondary"
          >
            {DEVICE_SESSION_MESSAGES.tryAgain}
          </LoadingButton>
        </div>
      ) : null}

      {devices !== null && devices.length === 0 ? (
        <p className="text-sm text-muted-foreground">{DEVICE_SESSION_MESSAGES.empty}</p>
      ) : null}

      {devices !== null && devices.length > 0 ? (
        <ul aria-label={DEVICE_SESSION_MESSAGES.heading} className="space-y-2">
          {devicesInDisplayOrder(devices, null).map((device) => (
            <SignedInDeviceRow
              device={device}
              isSigningOut={signingOutId === device.id}
              key={device.id}
              onSignOut={() => askToSignOut(device)}
            />
          ))}
        </ul>
      ) : null}

      <ConfirmDialog
        cancelLabel={DEVICE_SESSION_MESSAGES.cancel}
        confirmLabel={DEVICE_SESSION_MESSAGES.signOut}
        description={`${DEVICE_SESSION_MESSAGES.confirmBody} ${DEVICE_SESSION_MESSAGES.passwordAdvice}`}
        fallbackFocusRef={headingRef}
        onCancel={() => setIsConfirmOpen(false)}
        onConfirm={() => (confirming ? signOut(confirming) : undefined)}
        open={isConfirmOpen}
        title={confirmSignOutDeviceTitle(confirmingName)}
        variant="destructive"
      />
    </section>
  );
}
