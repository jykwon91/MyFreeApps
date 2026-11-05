import { Skeleton, useTheme } from "@platform/mobile";
import { View } from "react-native";
import { CALENDAR_MESSAGES, CALENDAR_SKELETON_GROUPS } from "../../constants/calendar";

export default function CalendarSkeleton() {
  const { spacing } = useTheme();
  return (
    <View accessible accessibilityLabel={CALENDAR_MESSAGES.loading} accessibilityRole="progressbar" testID="calendar-skeleton">
      {CALENDAR_SKELETON_GROUPS.map((group) => (
        <View key={group.key}>
          <View style={{ paddingHorizontal: spacing.lg, paddingVertical: spacing.sm }}>
            <Skeleton height={16} width="35%" />
          </View>
          {group.rows.map((row) => (
            <View key={row} style={{ gap: spacing.xs, paddingHorizontal: spacing.lg, paddingVertical: spacing.md }}>
              <Skeleton height={20} width="60%" />
              <Skeleton height={14} width="50%" />
              <Skeleton height={14} width="45%" />
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}
