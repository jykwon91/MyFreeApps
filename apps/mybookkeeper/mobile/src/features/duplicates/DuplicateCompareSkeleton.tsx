import { Skeleton, useTheme } from "@platform/mobile";
import { View } from "react-native";
import { DUPLICATES_MESSAGES as MESSAGES } from "../../constants/duplicates";

const FIELD_ROWS = ["a", "b", "c", "d", "e"] as const;
const CARDS = ["a", "b"] as const;

/** Two stacked records, then the choices: the shape of the loaded screen. */
export default function DuplicateCompareSkeleton() {
  const { spacing } = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={MESSAGES.loadingPair}
      accessibilityRole="progressbar"
      style={{ gap: spacing.lg, padding: spacing.lg }}
      testID="duplicate-compare-skeleton"
    >
      <Skeleton height={20} width="60%" />
      {CARDS.map((card) => (
        <View key={card} style={{ gap: spacing.sm }}>
          <Skeleton height={16} width="40%" />
          <Skeleton height={28} width="35%" />
          {FIELD_ROWS.map((row) => (
            <Skeleton height={16} key={row} />
          ))}
        </View>
      ))}
    </View>
  );
}
