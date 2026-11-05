import { Skeleton, useTheme } from "@platform/mobile";
import { View } from "react-native";
import { INSURANCE_MESSAGES, POLICY_SKELETON_ROWS } from "../../constants/insurance";

export default function PoliciesSkeleton() {
  const { spacing } = useTheme();
  return (
    <View accessible accessibilityLabel={INSURANCE_MESSAGES.loadingList} accessibilityRole="progressbar" testID="policies-skeleton">
      {POLICY_SKELETON_ROWS.map((row) => (
        <View key={row} style={{ gap: spacing.xs, paddingHorizontal: spacing.lg, paddingVertical: spacing.md }}>
          <Skeleton height={20} width="65%" />
          <Skeleton height={14} width="50%" />
        </View>
      ))}
    </View>
  );
}
