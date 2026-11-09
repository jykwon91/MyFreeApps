import { Skeleton, useTheme } from "@platform/mobile";
import { View } from "react-native";
import { PROPERTY_PNL_MESSAGES as MESSAGES, PROPERTY_PNL_SKELETON_ROWS } from "../../constants/propertyPnl";

export default function PropertyPnlSkeleton() {
  const { spacing } = useTheme();
  return (
    <View accessible accessibilityLabel={MESSAGES.loading} accessibilityRole="progressbar" testID="property-pnl-skeleton">
      <View style={{ gap: spacing.sm, padding: spacing.lg }}>
        <Skeleton height={20} width="40%" />
        <Skeleton height={28} width="60%" />
        <Skeleton height={14} width="50%" />
      </View>
      {PROPERTY_PNL_SKELETON_ROWS.map((row) => (
        <View key={row} style={{ gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.md }}>
          <Skeleton height={20} width="55%" />
          <Skeleton height={24} width="35%" />
          <Skeleton height={14} width="70%" />
        </View>
      ))}
    </View>
  );
}
