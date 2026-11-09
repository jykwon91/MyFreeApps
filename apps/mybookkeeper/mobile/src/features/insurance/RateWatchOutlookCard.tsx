import type { InsurancePolicyRateOutlook } from "@mybookkeeper/api-client/types/insurance/insurance-policy-rate-outlook";
import { formatAnnualPremium } from "@mybookkeeper/api-client/utils/insurancePolicyFormat";
import { formatChangePct, formatFilingDate, formatFoldSummary, formatOutlookHeadline, formatPremiumDelta } from "@mybookkeeper/api-client/utils/rateFilingFormat";
import { LoadingButton, useTheme } from "@platform/mobile";
import { useState } from "react";
import { Text, View } from "react-native";
import { RATE_WATCH_MESSAGES } from "../../constants/insuranceRateWatch";
import RateFilingDetail from "./RateFilingDetail";

/**
 * One policy's renewal outlook. Every policy gets a card, including ones the feed can't cover:
 * a policy that was answered must not look like one that was skipped. Only filings in force will
 * ever be billed, so those lead and the rest fold away.
 */
export default function RateWatchOutlookCard({ outlook }: { outlook: InsurancePolicyRateOutlook }) {
  const { colors, spacing, radius, fontSize } = useTheme();
  const [isFolded, setIsFolded] = useState(true);
  const { projected_change_pct: pct, unavailable_reason: reason } = outlook;
  const hasMovement = reason === null && pct !== null && pct !== 0;
  const delta = formatPremiumDelta(outlook.current_premium_cents, outlook.projected_premium_cents);
  const inForce = outlook.filings.filter((filing) => filing.is_in_force);
  const rest = outlook.filings.filter((filing) => !filing.is_in_force);
  const hasPendingOnly = inForce.length === 0 && rest.some((filing) => filing.is_pending);
  const showRest = inForce.length === 0 || !isFolded;
  const title = outlook.property_name ? `${outlook.property_name} · ${outlook.policy_label}` : outlook.policy_label;
  return (
    <View style={{ gap: spacing.xs, padding: spacing.md, borderWidth: 1, borderColor: hasMovement ? colors.border : colors.muted, borderRadius: radius.md }}>
      <Text accessibilityRole="header" style={{ fontSize: fontSize.md, fontWeight: "600", color: colors.foreground }}>{title}</Text>
      <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{`${RATE_WATCH_MESSAGES.renews} ${formatFilingDate(outlook.expiration_date)}`}</Text>
      {reason ? (
        <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{reason}</Text>
      ) : (
        <>
          <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{formatOutlookHeadline(pct, outlook.carrier, { hasPendingOnly })}</Text>
          {hasMovement ? (
            <Text style={{ fontSize: fontSize.lg, fontWeight: "600", color: colors.foreground }}>
              {`${formatAnnualPremium(outlook.current_premium_cents)} → ${formatAnnualPremium(outlook.projected_premium_cents)}`}
              <Text style={{ fontSize: fontSize.sm, fontWeight: "400", color: colors.mutedForeground }}>
                {` (${[delta, formatChangePct(pct), RATE_WATCH_MESSAGES.estimated].filter(Boolean).join(", ")})`}
              </Text>
            </Text>
          ) : null}
        </>
      )}
      {inForce.map((filing) => (
        <RateFilingDetail filing={filing} key={filing.serff_id} />
      ))}
      {showRest ? rest.map((filing) => <RateFilingDetail filing={filing} key={filing.serff_id} />) : null}
      {inForce.length > 0 && rest.length > 0 && isFolded ? (
        <LoadingButton onPress={() => setIsFolded(false)} variant="ghost">
          {formatFoldSummary(rest)}
        </LoadingButton>
      ) : null}
    </View>
  );
}
