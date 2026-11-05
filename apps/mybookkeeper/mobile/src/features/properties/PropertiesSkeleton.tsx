import { Skeleton, useTheme } from "@platform/mobile";
import { View } from "react-native";
import { PROPERTY_MESSAGES, PROPERTY_SKELETON_ROWS } from "../../constants/properties";

export default function PropertiesSkeleton() {
  const { spacing } = useTheme();
  return (
    <View accessible accessibilityLabel={PROPERTY_MESSAGES.loading} accessibilityRole="progressbar" testID="properties-skeleton">
      {PROPERTY_SKELETON_ROWS.map((row) => (
        <View key={row} style={{ gap: spacing.xs, paddingHorizontal: spacing.lg, paddingVertical: spacing.md }}>
          <Skeleton height={20} width="55%" />
          <Skeleton height={14} width="75%" />
          <Skeleton height={14} width="45%" />
        </View>
      ))}
    </View>
  );
}
