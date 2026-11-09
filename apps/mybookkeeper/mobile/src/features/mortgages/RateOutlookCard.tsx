import { MORTGAGE_VERDICT_HEADLINE } from "@mybookkeeper/api-client/constants/mortgageVerdictLabels";
import type { MortgageRefiOutlook } from "@mybookkeeper/api-client/types/mortgage/mortgage-refi-outlook";
import { formatRatePct } from "@mybookkeeper/api-client/utils/mortgageFormat";
import { useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import PropertyOccupancyFixer from "./PropertyOccupancyFixer";
import RateOutlookNumbers from "./RateOutlookNumbers";

interface RateOutlookCardProps {
  outlook: MortgageRefiOutlook;
  /** Re-runs the check after a blocker on this card has been cleared. */
  onRecheck: () => void;
}

/**
 * One loan's outlook. Every loan gets a card, including ones that can't be compared, so a loan
 * that was answered never looks like one that was skipped. A card worth acting on is drawn louder.
 */
export default function RateOutlookCard({ outlook, onRecheck }: RateOutlookCardProps) {
  const { colors, spacing, radius, fontSize } = useTheme();
  const isActionable = outlook.verdict === "worth_pricing";
  return (
    <View
      accessible={false}
      style={{
        gap: spacing.sm,
        padding: spacing.md,
        borderWidth: isActionable ? 2 : 1,
        borderColor: isActionable ? colors.primary : colors.border,
        borderRadius: radius.md,
      }}
    >
      <Text accessibilityRole="header" style={{ fontSize: fontSize.md, fontWeight: "600", color: colors.foreground }}>
        {outlook.lender ? `${outlook.property_name} · ${outlook.lender}` : outlook.property_name}
      </Text>
      <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{formatRatePct(outlook.current_rate_pct)}</Text>
      {outlook.unavailable_reason ? (
        <>
          <Text style={{ fontSize: fontSize.md, color: colors.mutedForeground }}>{outlook.unavailable_reason}</Text>
          <PropertyOccupancyFixer onFixed={onRecheck} propertyId={outlook.property_id} />
        </>
      ) : (
        <>
          <Text style={{ fontSize: fontSize.md, color: colors.foreground }}>{MORTGAGE_VERDICT_HEADLINE[outlook.verdict]}</Text>
          <RateOutlookNumbers outlook={outlook} />
        </>
      )}
    </View>
  );
}
