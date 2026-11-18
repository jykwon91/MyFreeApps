import { LoadingRegion, Skeleton, useTheme } from "@platform/mobile";
import { ScrollView } from "react-native";

export default function PromoteSkeleton() {
  const { spacing } = useTheme();
  return (
    <ScrollView contentContainerStyle={{ padding: spacing.lg }} contentInsetAdjustmentBehavior="automatic" scrollEnabled={false}>
      <LoadingRegion label="Loading this inquiry" style={{ gap: spacing.lg }}>
        <Skeleton height={48} />
        <Skeleton height={48} />
        <Skeleton height={48} />
        <Skeleton height={48} />
      </LoadingRegion>
    </ScrollView>
  );
}
