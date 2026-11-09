import type { InsurancePolicyDraft } from "@mybookkeeper/api-client/types/insurance/insurance-policy-draft";
import { CONFIDENCE_NOTE, notesParagraphs, referenceSummary } from "@mybookkeeper/api-client/utils/documentDraftNotices";
import { Banner, useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { POLICY_READER_MESSAGES } from "../../constants/insuranceForm";

/**
 * What I made of the document beyond the fields I filled in. Confidence and warnings say whether
 * to trust what is on the form, so they stay in view. The rest is reference, so it is just text
 * under a heading and never touches the form. My notes are shown as written, not saved for them.
 */
export default function PolicyDraftNotices({ draft }: { draft: InsurancePolicyDraft }) {
  const { colors, spacing, fontSize } = useTheme();
  const confidence = CONFIDENCE_NOTE[draft.confidence] ?? CONFIDENCE_NOTE.low;
  const paragraphs = draft.notes === null ? [] : notesParagraphs(draft.notes);
  const hasReference = draft.unrepresented.length > 0 || paragraphs.length > 0;
  return (
    <View accessibilityLiveRegion="polite" style={{ gap: spacing.md }}>
      {draft.confidence === "high" ? <Banner message={confidence} tone="success" /> : null}
      {draft.confidence === "medium" ? <Text style={{ fontSize: fontSize.sm, color: colors.foreground }}>{confidence}</Text> : null}
      {draft.confidence !== "high" && draft.confidence !== "medium" ? <Banner message={confidence} /> : null}
      {draft.warnings.map((warning) => (
        <Banner key={warning} message={warning} />
      ))}
      {hasReference ? (
        <View style={{ gap: spacing.sm }}>
          <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{referenceSummary(draft.unrepresented.length, paragraphs.length > 0)}</Text>
          {draft.unrepresented.length > 0 ? (
            <View style={{ gap: spacing.xs }}>
              <Text style={{ fontSize: fontSize.sm, fontWeight: "600", color: colors.foreground }}>{POLICY_READER_MESSAGES.otherTerms}</Text>
              {draft.unrepresented.map((term) => (
                <Text key={term} selectable style={{ fontSize: fontSize.sm, color: colors.foreground }}>
                  {`• ${term}`}
                </Text>
              ))}
            </View>
          ) : null}
          {paragraphs.length > 0 ? (
            <View style={{ gap: spacing.xs }}>
              <Text style={{ fontSize: fontSize.sm, fontWeight: "600", color: colors.foreground }}>{POLICY_READER_MESSAGES.myNotes}</Text>
              {paragraphs.map((paragraph) => (
                <Text key={paragraph} selectable style={{ fontSize: fontSize.sm, color: colors.foreground }}>
                  {paragraph}
                </Text>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
