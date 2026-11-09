import type { TaxAdvisorSuggestionRead } from "@mybookkeeper/api-client/types/tax/TaxAdvisorSuggestionRead";
import { SUGGESTION_SEVERITY_LABELS } from "@mybookkeeper/api-client/constants/taxAdvisor";
import { formatCurrency } from "@platform/core/utils/currency";
import { LoadingButton, useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { TAX_ADVISOR_MESSAGES as MESSAGES } from "../../constants/taxAdvisor";
import { useIsAdmin } from "../workspace/useIsAdmin";
import { useSuggestionStatus } from "./useSuggestionStatus";

/** One piece of advice. Owners and admins can mark it resolved or dismiss it. */
export default function TaxSuggestionCard({ suggestion, returnId }: { suggestion: TaxAdvisorSuggestionRead; returnId: string }) {
  const { colors, spacing, fontSize, radius } = useTheme();
  const isAdmin = useIsAdmin();
  const { update, pending, isBusy } = useSuggestionStatus(returnId, suggestion.db_id);
  const muted = { fontSize: fontSize.sm, color: colors.mutedForeground } as const;
  const tags = [suggestion.irs_reference, suggestion.affected_form, ...(suggestion.affected_properties ?? [])].filter(Boolean);
  return (
    <View
      accessible={false}
      style={{ gap: spacing.sm, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md }}
      testID={`suggestion-${suggestion.db_id}`}
    >
      <Text style={{ fontSize: fontSize.md, fontWeight: "700", color: colors.foreground }}>{suggestion.title}</Text>
      <Text style={muted}>{`${SUGGESTION_SEVERITY_LABELS[suggestion.severity]} · ${MESSAGES.confidence(suggestion.confidence)}`}</Text>
      <Text style={{ fontSize: fontSize.sm, color: colors.foreground }}>{suggestion.description}</Text>
      {suggestion.estimated_savings != null ? (
        <Text style={{ fontSize: fontSize.sm, fontWeight: "600", color: colors.foreground }}>{MESSAGES.savings(formatCurrency(suggestion.estimated_savings))}</Text>
      ) : null}
      <Text style={{ fontSize: fontSize.sm, color: colors.foreground }}>
        <Text style={{ fontWeight: "600" }}>{`${MESSAGES.nextStep}: `}</Text>
        {suggestion.action}
      </Text>
      {tags.length > 0 ? <Text style={muted}>{tags.join(" · ")}</Text> : null}
      {isAdmin ? (
        <View style={{ gap: spacing.sm }}>
          <LoadingButton disabled={isBusy} isLoading={pending === "resolved"} loadingText={MESSAGES.resolving} onPress={() => update("resolved")} variant="secondary">
            {MESSAGES.markResolved}
          </LoadingButton>
          <LoadingButton disabled={isBusy} isLoading={pending === "dismissed"} loadingText={MESSAGES.dismissing} onPress={() => update("dismissed")} variant="secondary">
            {MESSAGES.dismiss}
          </LoadingButton>
        </View>
      ) : null}
    </View>
  );
}
