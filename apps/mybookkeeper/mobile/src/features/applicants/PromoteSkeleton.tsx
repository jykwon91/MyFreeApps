import { Skeleton, useTheme } from "@platform/mobile";
import { ScrollView } from "react-native";

export default function PromoteSkeleton() {
  const { spacing } = useTheme();
  return (
    <ScrollView accessibilityLabel="Loading this inquiry" contentContainerStyle={{ gap: spacing.lg, padding: spacing.lg }} contentInsetAdjustmentBehavior="automatic" scrollEnabled={false}>
      <Skeleton height={48} />
      <Skeleton height={48} />
      <Skeleton height={48} />
      <Skeleton height={48} />
    </ScrollView>
  );
}
