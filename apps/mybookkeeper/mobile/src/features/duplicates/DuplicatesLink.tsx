import { useGetDuplicatesQuery } from "@mybookkeeper/api-client/store/transactionsApi";
import { MIN_TOUCH_TARGET, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { Pressable, Text } from "react-native";
import { DUPLICATES_LINK } from "../../constants/duplicates";
import { duplicateCountLine } from "./duplicateDisplay";

/** Shown on the Money tab only while there is something to review. */
export default function DuplicatesLink() {
  const { colors, spacing, radius, fontSize } = useTheme();
  const { data } = useGetDuplicatesQuery();
  const count = data?.pairs.length ?? 0;
  if (count === 0) return null;
  return (
    <Pressable
      accessibilityHint="Opens the list to review"
      accessibilityLabel={duplicateCountLine(count)}
      accessibilityRole="button"
      onPress={() => router.push(DUPLICATES_LINK)}
      style={{
        minHeight: MIN_TOUCH_TARGET,
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.sm,
        paddingHorizontal: spacing.md,
        borderRadius: radius.md,
        backgroundColor: colors.muted,
      }}
    >
      <Text style={{ flex: 1, fontSize: fontSize.md, color: colors.foreground }}>{duplicateCountLine(count)}</Text>
      <Text accessibilityElementsHidden importantForAccessibility="no" style={{ fontSize: fontSize.lg, color: colors.mutedForeground }}>
        {"›"}
      </Text>
    </Pressable>
  );
}
