import { DISCOVERY_STAGE_SECONDS } from "@myrecipes/api-client/constants/discovery";
import { useAnnouncement, useTheme } from "@platform/mobile";
import { ActivityIndicator, Text, View } from "react-native";
import { useTicker } from "../../hooks/useTicker";

const STAGE_MS = DISCOVERY_STAGE_SECONDS * 1000;

/**
 * The line above a discovery wait. The stage follows the time since `startedAt` rather than
 * counting ticks, so after the app has been in the background it shows where the wait has got to.
 */
export default function DiscoveryStatus({ stages, startedAt }: { stages: readonly string[]; startedAt: number }) {
  const { colors, spacing, fontSize } = useTheme();
  const now = useTicker(startedAt + STAGE_MS * (stages.length - 1));
  const index = Math.min(Math.max(Math.floor((now - startedAt) / STAGE_MS), 0), stages.length - 1);
  const stage = stages[index];
  useAnnouncement(stage);

  return (
    <View accessibilityLiveRegion="polite" style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
      <ActivityIndicator color={colors.primary} />
      <Text style={{ flex: 1, color: colors.mutedForeground, fontSize: fontSize.sm }}>{stage}</Text>
    </View>
  );
}
