import { Skeleton, useTheme } from "@platform/mobile";
import { View } from "react-native";
import { VENDOR_RULE_DETAIL_SKELETON_FACTS, VENDOR_RULE_MESSAGES } from "../../constants/vendorRules";

/** Mirrors the loaded rule: title, type, the facts, then the delete button. */
export default function VendorRuleDetailSkeleton() {
  const { spacing } = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={VENDOR_RULE_MESSAGES.loadingOne}
      accessibilityRole="progressbar"
      style={{ gap: spacing.lg, padding: spacing.lg }}
      testID="vendor-rule-detail-skeleton"
    >
      <View style={{ gap: spacing.xs }}>
        <Skeleton height={28} width="65%" />
        <Skeleton height={20} width="30%" />
      </View>
      {VENDOR_RULE_DETAIL_SKELETON_FACTS.map((fact) => (
        <View key={fact} style={{ gap: spacing.xs }}>
          <Skeleton height={14} width="30%" />
          <Skeleton height={20} width="55%" />
        </View>
      ))}
      <Skeleton height={44} />
    </View>
  );
}
