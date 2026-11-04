import { Skeleton, useTheme } from "@platform/mobile";
import { View } from "react-native";

const ROWS = ["a", "b", "c", "d", "e", "f"];

export default function DocumentsSkeleton() {
  const { spacing } = useTheme();
  return (
    <View style={{ gap: spacing.lg, padding: spacing.lg }} testID="documents-skeleton">
      {ROWS.map((row) => (
        <View key={row} style={{ gap: spacing.xs }}>
          <Skeleton height={20} />
          <Skeleton height={14} />
        </View>
      ))}
    </View>
  );
}
