import { MIN_TOUCH_TARGET, Skeleton, useTheme } from "@platform/mobile";
import { View } from "react-native";
import { COOK_LOG_PHONE_MESSAGES as MESSAGES, COOK_LOG_SKELETON_ROWS } from "../../constants/cookLog";
import { cookRowFrame } from "../../utils/cookRowFrame";

/** The cook log's rows while it loads: the date, version and stars line, the notes, and the delete button. */
export default function CookLogSkeleton() {
  const theme = useTheme();
  const { spacing, fontSize } = theme;

  return (
    <View accessibilityLabel={MESSAGES.loading} accessible style={{ gap: spacing.md }}>
      {Array.from({ length: COOK_LOG_SKELETON_ROWS }, (_, index) => (
        <View key={index} style={cookRowFrame(theme)} testID="cook-skeleton-row">
          <View style={{ flex: 1, gap: spacing.xs }}>
            <Skeleton height={fontSize.md} width="55%" />
            <Skeleton height={fontSize.sm} width="80%" />
          </View>
          <View style={{ width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, alignItems: "center", justifyContent: "center" }}>
            <Skeleton height={fontSize.sm} width={MIN_TOUCH_TARGET - spacing.md} />
          </View>
        </View>
      ))}
    </View>
  );
}
