import { Alert, Text, View } from "react-native";
import { useTheme } from "../theme/useTheme";
import type { SignedInDevice } from "../types/SignedInDevice";
import { deviceDisplayName } from "../utils/deviceName";
import { formatLastUsed, formatSignedInDate } from "../utils/formatDeviceTimes";
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

  function confirmSignOut(): void {
    Alert.alert(
      `Sign out ${name}?`,
      "It won't be able to renew its sign-in, but it can stay signed in for up to 30 minutes. If you think someone else has your password, reset it on the website too.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Sign out", style: "destructive", onPress: onSignOut },
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
      <Text style={{ color: colors.foreground, fontSize: fontSize.md, fontWeight: "600" }}>{name}</Text>
      {isThisDevice ? (
        <Text style={{ color: colors.foreground, fontSize: fontSize.xs, fontWeight: "600" }}>This device</Text>
      ) : null}
      <Text style={{ color: colors.foreground, fontSize: fontSize.sm }}>{formatLastUsed(device.last_used_at)}</Text>
      <Text style={{ color: colors.mutedForeground, fontSize: fontSize.xs }}>{formatSignedInDate(device.created_at)}</Text>
      {isThisDevice ? null : (
        <LoadingButton
          accessibilityLabel={`Sign out ${name}`}
          isLoading={isSigningOut}
          loadingText="Signing out..."
          onPress={confirmSignOut}
          variant="secondary"
        >
          Sign out
        </LoadingButton>
      )}
    </View>
  );
}
