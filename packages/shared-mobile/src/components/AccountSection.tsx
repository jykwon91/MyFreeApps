import { useState } from "react";
import { Text, View } from "react-native";
import { useDevices } from "../hooks/useDevices";
import { useSession } from "../hooks/useSession";
import { useTheme } from "../theme/useTheme";
import type { AccountMessage } from "../types/AccountMessage";
import type { SignedInDevice } from "../types/SignedInDevice";
import { deviceDisplayName } from "../utils/deviceName";
import DeviceRow from "./DeviceRow";
import LoadingButton from "./LoadingButton";
import Skeleton from "./Skeleton";

interface AccountSectionProps {
  appName: string;
  devices: ReturnType<typeof useDevices>;
  onMessage: (message: AccountMessage) => void;
  onDeleteAccount: () => void;
}

/** This phone first, then the others by how recently they were used. */
function inDisplayOrder(devices: SignedInDevice[], thisSessionId: string): SignedInDevice[] {
  return [...devices].sort((a, b) => {
    if (a.id === thisSessionId) return -1;
    if (b.id === thisSessionId) return 1;
    return b.last_used_at.localeCompare(a.last_used_at);
  });
}

export default function AccountSection({ appName, devices, onMessage, onDeleteAccount }: AccountSectionProps) {
  const { colors, spacing, fontSize } = useTheme();
  const { session, state } = useSession();
  const [signingOutId, setSigningOutId] = useState<string | null>(null);
  if (state.status !== "signedIn") return null;

  async function signOutThisPhone(): Promise<void> {
    const { serverReached } = await session.signOut();
    onMessage(
      serverReached
        ? { message: "You're signed out.", variant: "success" }
        : {
            message:
              "Signed out on this phone. We couldn't reach the server, so this phone may still appear in your device list. Sign out of it from another device.",
            variant: "error",
          },
    );
  }

  async function signOutOther(device: SignedInDevice): Promise<void> {
    const name = deviceDisplayName(device);
    setSigningOutId(device.id);
    try {
      const outcome = await devices.signOutDevice(device.id);
      onMessage(
        outcome === "alreadyGone"
          ? { message: "That device was already signed out.", variant: "success" }
          : { message: `Signed out ${name}. It may stay signed in for up to 30 minutes.`, variant: "success" },
      );
    } catch {
      onMessage({ message: `Couldn't sign out ${name}. Check your connection and try again.`, variant: "error" });
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
          Devices signed in
        </Text>
        <Text style={{ color: colors.mutedForeground, fontSize: fontSize.xs }}>
          Phones and tablets signed in to your {appName} account. Signing one out stops it renewing its sign-in, but it
          can stay signed in for up to 30 minutes.
        </Text>
        {devices.devices === null && !devices.hasError ? (
          <>
            <Skeleton height={96} testID="device-skeleton" />
            <Skeleton height={96} testID="device-skeleton" />
          </>
        ) : null}
        {devices.hasError ? (
          <>
            <Text style={{ color: colors.destructiveText, fontSize: fontSize.sm }}>
              Couldn't load your devices. Check your connection and try again.
            </Text>
            <LoadingButton loadingText="Trying again..." onPress={devices.reload} variant="secondary">
              Try again
            </LoadingButton>
          </>
        ) : null}
        {devices.devices
          ? inDisplayOrder(devices.devices, state.sessionId).map((device) => (
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
