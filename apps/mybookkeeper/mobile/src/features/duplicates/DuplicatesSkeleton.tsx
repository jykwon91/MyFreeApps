import { Skeleton, useTheme } from "@platform/mobile";
import { View } from "react-native";
import { DUPLICATES_MESSAGES as MESSAGES, DUPLICATES_SKELETON_ROWS } from "../../constants/duplicates";

export default function DuplicatesSkeleton() {
  const { spacing } = useTheme();
  return (
    <View accessible accessibilityLabel={MESSAGES.loading} accessibilityRole="progressbar" testID="duplicates-skeleton">
      <View style={{ padding: spacing.lg }}>
        <Skeleton height={20} width="50%" />
      </View>
      {DUPLICATES_SKELETON_ROWS.map((row) => (
        <View key={row} style={{ gap: spacing.xs, paddingHorizontal: spacing.lg, paddingVertical: spacing.md }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", gap: spacing.lg }}>
            <Skeleton height={20} width="55%" />
            <Skeleton height={20} width={72} />
          </View>
          <Skeleton height={14} width="45%" />
          <Skeleton height={20} width={120} />
        </View>
      ))}
    </View>
  );
}
