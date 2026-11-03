import { useTheme } from "@platform/mobile";
import { useEffect } from "react";
import { AccessibilityInfo, Text, View } from "react-native";
import type { CookTimer } from "../../types/CookTimer";
import CookBarButton from "./CookBarButton";

/** Says plainly when a running timer can't alert someone on time, or at all. */
export default function CookTimerAlertNote({
  now,
  onAllowExact,
  timers,
}: {
  now: number;
  onAllowExact: () => void;
  timers: CookTimer[];
}) {
  const { colors, spacing, fontSize } = useTheme();
  const running = timers.filter((timer) => timer.endsAt > now);
  const isOff = running.some((timer) => timer.alert === "off");
  const hasFailed = running.some((timer) => timer.alert === "failed");
  const isLate = running.some((timer) => timer.alert === "late");
  const message = isOff
    ? "Notifications are off, so keep the app open to see your timer finish."
    : hasFailed
      ? "Couldn't set an alert, so keep the app open to see your timer finish."
      : isLate
        ? "Your phone may alert you late unless you allow exact alerts."
        : null;

  useEffect(() => {
    if (message) AccessibilityInfo.announceForAccessibility(message);
  }, [message]);

  if (!message) return null;

  return (
    <View style={{ padding: spacing.sm, gap: spacing.xs }}>
      <Text style={{ color: colors.mutedForeground, fontSize: fontSize.sm }}>
        {message}
      </Text>
      {!isOff && !hasFailed ? <CookBarButton isOutlined label="Allow exact alerts" onPress={onAllowExact} /> : null}
    </View>
  );
}
