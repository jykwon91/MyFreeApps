import { useState } from "react";
import { Text, View } from "react-native";
import { DEVICE_SESSION_MESSAGES, devicesDescription } from "@platform/core/constants/deviceSessions";
import type { SignedInDevice } from "@platform/core/types/security/signed-in-device";
import type { UseDevicesResult } from "@platform/core/types/security/use-devices-result";
import { deviceDisplayName } from "@platform/core/utils/deviceName";
import { deviceSignOutMessage } from "@platform/core/utils/deviceSignOutMessage";
import { devicesInDisplayOrder } from "@platform/core/utils/devicesInDisplayOrder";
import { useSession } from "../hooks/useSession";
import { useSignOutThisPhone } from "../hooks/useSignOutThisPhone";
import { useTheme } from "../theme/useTheme";
import type { AccountMessage } from "../types/AccountMessage";
import DeviceRow from "./DeviceRow";
import LoadingButton from "./LoadingButton";
import LoadingRegion from "./LoadingRegion";
import Skeleton from "./Skeleton";

interface AccountSectionProps {
  appName: string;
  devices: UseDevicesResult;
  onMessage: (message: AccountMessage) => void;
  onDeleteAccount: () => void;
}

export default function AccountSection({ appName, devices, onMessage, onDeleteAccount }: AccountSectionProps) {
  const { colors, spacing, fontSize } = useTheme();
  const { state } = useSession();
  const signOutThisPhone = useSignOutThisPhone(onMessage);
  const [signingOutId, setSigningOutId] = useState<string | null>(null);
  if (state.status !== "signedIn") return null;

  async function signOutOther(device: SignedInDevice): Promise<void> {
    const name = deviceDisplayName(device);
    setSigningOutId(device.id);
    try {
      onMessage(deviceSignOutMessage(await devices.signOutDevice(device.id), name));
    } catch {
      onMessage(deviceSignOutMessage(null, name));
    } finally {
      setSigningOutId(null);
    }
  }

  const headingStyle = { color: colors.foreground, fontSize: fontSize.md, fontWeight: "600" } as const;

  return (
    <View style={{ gap: spacing.lg }}>
      <View style={{ gap: spacing.sm }}>
        <Text accessibilityRole="header" style={headingStyle}>
          Account
        </Text>
        <Text style={{ color: colors.foreground, fontSize: fontSize.sm }}>Signed in as {state.email}</Text>
        <LoadingButton loadingText="Signing out..." onPress={signOutThisPhone} variant="secondary">
          Sign out of this phone
        </LoadingButton>
      </View>
      <View style={{ gap: spacing.sm }}>
        <Text accessibilityRole="header" style={headingStyle}>
          {DEVICE_SESSION_MESSAGES.heading}
        </Text>
        <Text style={{ color: colors.mutedForeground, fontSize: fontSize.xs }}>
          {devicesDescription(appName)}
        </Text>
        {devices.devices === null && !devices.hasError ? (
          <LoadingRegion label={DEVICE_SESSION_MESSAGES.loading} style={{ gap: spacing.sm }}>
            <Skeleton height={96} testID="device-skeleton" />
            <Skeleton height={96} testID="device-skeleton" />
          </LoadingRegion>
        ) : null}
        {devices.hasError ? (
          <>
            <Text style={{ color: colors.destructiveText, fontSize: fontSize.sm }}>
              {DEVICE_SESSION_MESSAGES.loadFailed}
            </Text>
            <LoadingButton loadingText={DEVICE_SESSION_MESSAGES.tryingAgain} onPress={devices.reload} variant="secondary">
              {DEVICE_SESSION_MESSAGES.tryAgain}
            </LoadingButton>
          </>
        ) : null}
        {devices.devices
          ? devicesInDisplayOrder(devices.devices, state.sessionId).map((device) => (
              <DeviceRow
                device={device}
                isSigningOut={signingOutId === device.id}
                isThisDevice={device.id === state.sessionId}
                key={device.id}
                onSignOut={() => void signOutOther(device)}
              />
            ))
          : null}
      </View>
      <LoadingButton onPress={onDeleteAccount} variant="destructive">
        Delete account
      </LoadingButton>
    </View>
  );
}
