import { Alert, Text, View } from "react-native";
import { useTheme } from "../theme/useTheme";
import {
  confirmSignOutDeviceTitle,
  DEVICE_SESSION_MESSAGES,
  deviceRowLabel,
  signOutDeviceLabel,
} from "@platform/core/constants/deviceSessions";
import type { SignedInDevice } from "@platform/core/types/security/signed-in-device";
import { deviceDisplayName } from "@platform/core/utils/deviceName";
import { formatLastUsed, formatSignedInDate } from "@platform/core/utils/formatDeviceTimes";
import LoadingButton from "./LoadingButton";

interface DeviceRowProps {
  device: SignedInDevice;
  isThisDevice: boolean;
  isSigningOut: boolean;
  onSignOut: () => void;
}

export default function DeviceRow({ device, isThisDevice, isSigningOut, onSignOut }: DeviceRowProps) {
  const { colors, spacing, radius, fontSize } = useTheme();
  const name = deviceDisplayName(device);
  const lastUsed = formatLastUsed(device.last_used_at);
  const signedIn = formatSignedInDate(device.created_at);

  function confirmSignOut(): void {
    Alert.alert(
      confirmSignOutDeviceTitle(name),
      `${DEVICE_SESSION_MESSAGES.confirmBody} ${DEVICE_SESSION_MESSAGES.passwordAdviceOnPhone}`,
      [
        { text: DEVICE_SESSION_MESSAGES.cancel, style: "cancel" },
        { text: DEVICE_SESSION_MESSAGES.signOut, style: "destructive", onPress: onSignOut },
      ],
    );
  }

  return (
    <View
      style={{
        padding: spacing.md,
        gap: spacing.xs,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: radius.md,
        backgroundColor: colors.card,
      }}
    >
      <View
        accessible
        accessibilityLabel={deviceRowLabel(name, isThisDevice, lastUsed, signedIn)}
        style={{ gap: spacing.xs }}
      >
        <Text style={{ color: colors.foreground, fontSize: fontSize.md, fontWeight: "600" }}>{name}</Text>
        {isThisDevice ? (
          <Text style={{ color: colors.foreground, fontSize: fontSize.xs, fontWeight: "600" }}>{DEVICE_SESSION_MESSAGES.thisDevice}</Text>
        ) : null}
        <Text style={{ color: colors.foreground, fontSize: fontSize.sm }}>{lastUsed}</Text>
        <Text style={{ color: colors.mutedForeground, fontSize: fontSize.xs }}>{signedIn}</Text>
      </View>
      {isThisDevice ? null : (
        <LoadingButton
          accessibilityLabel={signOutDeviceLabel(name)}
          isLoading={isSigningOut}
          loadingText={DEVICE_SESSION_MESSAGES.signingOut}
          onPress={confirmSignOut}
          variant="secondary"
        >
          {DEVICE_SESSION_MESSAGES.signOut}
        </LoadingButton>
      )}
    </View>
  );
}
