import { Skeleton, useTheme } from "@platform/mobile";
import { View } from "react-native";

export default function InquiryReplySkeleton() {
  const { spacing } = useTheme();
  return (
    <View accessibilityLabel="Loading this inquiry" style={{ gap: spacing.md, padding: spacing.lg }}>
      <Skeleton height={20} width="60%" />
      <Skeleton height={48} />
      <Skeleton height={160} />
    </View>
  );
}
