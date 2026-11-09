import type { MortgageDraft } from "@mybookkeeper/api-client/types/mortgage/mortgage-draft";
import { Banner, useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { MORTGAGE_STATEMENT_MESSAGES as MESSAGES } from "../../constants/mortgageForm";
import CollapsibleSection from "../inquiries/CollapsibleSection";

/** The document's own paragraphs, kept as paragraphs. */
function paragraphsOf(notes: string | null): string[] {
  return (notes ?? "")
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph !== "");
}

function confidenceNote(confidence: string): string {
  const notes: Record<string, string> = MESSAGES.confidence;
  return notes[confidence] ?? MESSAGES.confidence.low;
}

/**
 * What the reading said beyond the fields it filled in. Confidence and warnings answer "can I
 * trust this", so they stay in view; the rest is reference and folds away behind a count.
 */
export default function MortgageDraftNotices({ draft }: { draft: MortgageDraft }) {
  const { colors, spacing, fontSize } = useTheme();
  const paragraphs = paragraphsOf(draft.notes);
  const terms = draft.unrepresented;
  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={{ fontSize: fontSize.sm, color: draft.confidence === "high" ? colors.foreground : colors.destructiveText }}>
        {confidenceNote(draft.confidence)}
      </Text>
      {draft.warnings.map((warning) => (
        <Banner key={warning} message={warning} />
      ))}
      {terms.length > 0 || paragraphs.length > 0 ? (
        <CollapsibleSection preview={MESSAGES.moreSummary(terms.length, paragraphs.length > 0)} title={MESSAGES.otherTerms}>
          <View style={{ gap: spacing.sm }}>
            {terms.map((term) => (
              <Text key={term} style={{ fontSize: fontSize.md, color: colors.foreground }}>{`• ${term}`}</Text>
            ))}
            {paragraphs.length > 0 ? (
              <Text style={{ fontSize: fontSize.sm, fontWeight: "600", color: colors.foreground }}>{MESSAGES.myNotes}</Text>
            ) : null}
            {paragraphs.map((paragraph) => (
              <Text key={paragraph} style={{ fontSize: fontSize.md, color: colors.foreground }}>{paragraph}</Text>
            ))}
          </View>
        </CollapsibleSection>
      ) : null}
    </View>
  );
}
