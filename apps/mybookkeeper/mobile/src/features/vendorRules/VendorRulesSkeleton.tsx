import { Skeleton, useTheme } from "@platform/mobile";
import { View } from "react-native";
import { VENDOR_RULE_MESSAGES, VENDOR_RULE_SKELETON_ROWS } from "../../constants/vendorRules";

export default function VendorRulesSkeleton() {
  const { spacing } = useTheme();
  return (
    <View accessible accessibilityLabel={VENDOR_RULE_MESSAGES.loadingList} accessibilityRole="progressbar" testID="vendor-rules-skeleton">
      {VENDOR_RULE_SKELETON_ROWS.map((row) => (
        <View key={row} style={{ gap: spacing.xs, paddingHorizontal: spacing.lg, paddingVertical: spacing.md }}>
          <Skeleton height={20} width="55%" />
          <Skeleton height={14} width="40%" />
        </View>
      ))}
    </View>
  );
}
