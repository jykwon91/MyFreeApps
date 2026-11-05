import { Skeleton, useTheme } from "@platform/mobile";
import { View } from "react-native";
import { MORTGAGE_MESSAGES, MORTGAGE_SKELETON_ROWS } from "../../constants/mortgages";

export default function MortgagesSkeleton() {
  const { spacing } = useTheme();
  return (
    <View accessible accessibilityLabel={MORTGAGE_MESSAGES.loadingList} accessibilityRole="progressbar" testID="mortgages-skeleton">
      {MORTGAGE_SKELETON_ROWS.map((row) => (
        <View key={row} style={{ gap: spacing.xs, paddingHorizontal: spacing.lg, paddingVertical: spacing.md }}>
          <Skeleton height={20} width="60%" />
          <Skeleton height={14} width="45%" />
          <Skeleton height={14} width="55%" />
        </View>
      ))}
    </View>
  );
}
