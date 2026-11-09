import { Skeleton, useTheme } from "@platform/mobile";
import { View } from "react-native";
import { PROPERTY_MESSAGES } from "../../constants/properties";

export default function PropertyDetailSkeleton() {
  const { spacing } = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={PROPERTY_MESSAGES.loadingOne}
      accessibilityRole="progressbar"
      style={{ gap: spacing.md, padding: spacing.lg }}
      testID="property-detail-skeleton"
    >
      <Skeleton height={28} width="70%" />
      <Skeleton height={20} width="50%" />
      <Skeleton height={44} />
      <Skeleton height={44} />
      <Skeleton height={44} />
    </View>
  );
}
