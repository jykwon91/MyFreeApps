import { MIN_TOUCH_TARGET, Skeleton, useTheme } from "@platform/mobile";
import { View } from "react-native";

/** A posting card's row of two full-size buttons, as a placeholder. */
export default function ButtonRowSkeleton() {
  const { spacing, radius } = useTheme();
  return (
    <View style={{ flexDirection: "row", gap: spacing.sm }} testID="button-row-skeleton">
      <View style={{ flex: 1 }}>
        <Skeleton borderRadius={radius.md} height={MIN_TOUCH_TARGET} />
      </View>
      <View style={{ flex: 1 }}>
        <Skeleton borderRadius={radius.md} height={MIN_TOUCH_TARGET} />
      </View>
    </View>
  );
}
