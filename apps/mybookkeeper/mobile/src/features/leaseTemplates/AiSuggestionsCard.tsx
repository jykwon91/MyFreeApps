import { LEASE_PLACEHOLDER_INPUT_TYPE_LABELS } from "@mybookkeeper/api-client/constants/leaseLabels";
import { splitSuggestions } from "@mybookkeeper/api-client/utils/leaseSuggestions";
import { LoadingButton, useTheme } from "@platform/mobile";
import { useState } from "react";
import { Text, View } from "react-native";
import { AI_SUGGESTION_MESSAGES as MESSAGES, suggestionsHeadline } from "../../constants/aiSuggestions";
import AiSuggestionRow from "./AiSuggestionRow";
import type { AiSuggestionsCardProps } from "../../types/AiSuggestionsCardProps";

/** What the AI found in a template just uploaded, beside what the bracket detector found. Read-only: the placeholders are edited on their own screen. */
export default function AiSuggestionsCard({ suggestions, savedKeys, onDismiss }: AiSuggestionsCardProps) {
  const { colors, spacing, fontSize, radius } = useTheme();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const items = suggestions.suggestions;
  const { newKeys, matchedCount } = splitSuggestions(items, savedKeys);

  return (
    <View style={{ gap: spacing.md, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.muted }} testID="ai-suggestions">
      <Text accessibilityLiveRegion="polite" accessibilityRole="header" style={{ fontSize: fontSize.md, fontWeight: "600", color: colors.foreground }}>
        {items.length === 0 ? MESSAGES.none : suggestionsHeadline(items.length, matchedCount)}
      </Text>
      {suggestions.truncated && suggestions.pages_note ? <Text style={{ fontSize: fontSize.sm, color: colors.foreground }}>{suggestions.pages_note}</Text> : null}
      {!isCollapsed ? items.map((item) => <AiSuggestionRow isNew={newKeys.has(item.key)} item={item} key={item.key} typeLabel={LEASE_PLACEHOLDER_INPUT_TYPE_LABELS[item.input_type] ?? item.input_type} />) : null}
      <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{MESSAGES.review}</Text>
      {items.length > 0 ? (
        <LoadingButton onPress={() => setIsCollapsed((current) => !current)} variant="secondary">
          {isCollapsed ? MESSAGES.show : MESSAGES.hide}
        </LoadingButton>
      ) : null}
      <LoadingButton onPress={onDismiss} variant="ghost">
        {MESSAGES.dismiss}
      </LoadingButton>
    </View>
  );
}
