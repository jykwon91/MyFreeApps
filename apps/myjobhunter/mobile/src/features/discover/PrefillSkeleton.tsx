import { MIN_TOUCH_TARGET, Skeleton, useTheme } from "@platform/mobile";
import { View } from "react-native";
import { DISCOVER_SKELETON_HEIGHTS as HEIGHTS } from "../../constants/discoverSkeleton";
import { PREFILL_SKELETON_FIELDS, SAVED_SEARCH_SHEET_MESSAGES as MESSAGES } from "../../constants/savedSearchSheet";

/** The JSearch fields' labels and boxes while the profile fills them in. */
export default function PrefillSkeleton() {
  const { spacing, radius } = useTheme();
  return (
    <View accessible accessibilityLabel={MESSAGES.loadingPrefill} accessibilityRole="progressbar" style={{ gap: spacing.md }} testID="saved-search-prefill-skeleton">
      {PREFILL_SKELETON_FIELDS.map((field) => (
        <View key={field} style={{ gap: spacing.xs }}>
          <Skeleton height={HEIGHTS.caption} width="30%" />
          <Skeleton borderRadius={radius.md} height={MIN_TOUCH_TARGET} />
        </View>
      ))}
    </View>
  );
}
