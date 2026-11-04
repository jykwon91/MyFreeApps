import { Skeleton, useTheme } from "@platform/mobile";
import { View } from "react-native";

const ROWS = ["a", "b", "c", "d", "e", "f"];

export function ApplicantSkeletonRow() {
  const { spacing } = useTheme();
  return (
    <View style={{ gap: spacing.xs, paddingHorizontal: spacing.lg, paddingVertical: spacing.md }}>
      <Skeleton height={20} width="55%" />
      <Skeleton height={14} width="70%" />
      <Skeleton height={20} width="30%" />
    </View>
  );
}

export default function ApplicantsSkeleton() {
  return (
    <View accessibilityLabel="Loading your applicants" testID="applicants-skeleton">
      {ROWS.map((row) => (
        <ApplicantSkeletonRow key={row} />
      ))}
    </View>
  );
}
