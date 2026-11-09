import { groupSuggestionsBySeverity } from "@mybookkeeper/api-client/utils/taxAdvisorView";
import { SUGGESTION_SEVERITY_LABELS } from "@mybookkeeper/api-client/constants/taxAdvisor";
import type { TaxAdvisorCachedResponse } from "@mybookkeeper/api-client/types/tax/TaxAdvisorCachedResponse";
import { formatAdvisorGeneratedAt } from "@mybookkeeper/api-client/utils/formatAdvisorGeneratedAt";
import { useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { TAX_ADVISOR_MESSAGES as MESSAGES } from "../../constants/taxAdvisor";
import TaxSuggestionCard from "./TaxSuggestionCard";
import TaxSuggestionResolvedRow from "./TaxSuggestionResolvedRow";

/** The advice on file, most important first. Dismissed advice is left out; resolved advice shrinks to a line. */
export default function TaxAdvisorResults({ cached, returnId }: { cached: TaxAdvisorCachedResponse; returnId: string }) {
  const { colors, spacing, fontSize } = useTheme();
  const groups = groupSuggestionsBySeverity(cached.suggestions);
  const muted = { fontSize: fontSize.sm, color: colors.mutedForeground } as const;
  return (
    <View style={{ gap: spacing.lg }}>
      {cached.generated_at ? <Text style={muted}>{MESSAGES.generatedOn(formatAdvisorGeneratedAt(cached.generated_at))}</Text> : null}
      {groups.length === 0 ? <Text style={{ fontSize: fontSize.md, fontWeight: "600", color: colors.foreground }}>{MESSAGES.allDoneHeading}</Text> : null}
      {groups.map(({ severity, items }) => (
        <View key={severity} style={{ gap: spacing.sm }}>
          <Text accessibilityRole="header" style={{ fontSize: fontSize.md, fontWeight: "600", color: colors.foreground }}>
            {MESSAGES.priority(SUGGESTION_SEVERITY_LABELS[severity], items.length)}
          </Text>
          {items.map((suggestion) =>
            suggestion.status === "resolved" ? (
              <TaxSuggestionResolvedRow key={suggestion.db_id} title={suggestion.title} />
            ) : (
              <TaxSuggestionCard key={suggestion.db_id} returnId={returnId} suggestion={suggestion} />
            ),
          )}
        </View>
      ))}
      <Text style={muted}>{cached.disclaimer}</Text>
    </View>
  );
}
