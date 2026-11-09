import type { SyncLog } from "@mybookkeeper/api-client/types/integration/sync-log";
import { getStatusLabel } from "@mybookkeeper/api-client/utils/syncStatusLabel";
import { MIN_TOUCH_TARGET, useTheme } from "@platform/mobile";
import { Pressable, Text } from "react-native";
import { INTEGRATIONS_MESSAGES as MESSAGES } from "../../constants/integrations";
import { timeAgo } from "../../utils/timeAgo";
import { syncStatusColor } from "./syncSessionDisplay";

interface SyncLogRowProps {
  log: SyncLog;
  /** How many queued emails belong to this sync; null while the queue is unknown. */
  itemCount: number | null;
  onPress: () => void;
}

export default function SyncLogRow({ log, itemCount, onPress }: SyncLogRowProps) {
  const { colors, spacing, fontSize } = useTheme();
  const label = getStatusLabel(log);
  const when = timeAgo(log.started_at);
  const details = [MESSAGES.sessionNumber(log.id), when, itemCount ? MESSAGES.sessionItems(itemCount) : null].filter(Boolean).join(" · ");
  return (
    <Pressable
      accessibilityLabel={`${label}. ${details}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: MIN_TOUCH_TARGET,
        gap: spacing.xs,
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        backgroundColor: pressed ? colors.muted : colors.background,
      })}
    >
      <Text style={{ fontSize: fontSize.md, fontWeight: "600", color: syncStatusColor(colors, log.status) }}>{label}</Text>
      <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{details}</Text>
    </Pressable>
  );
}
