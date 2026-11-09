import { MIN_TOUCH_TARGET, useTheme } from "@platform/mobile";
import { Pressable, Text, View } from "react-native";
import { TAX_FORM_MESSAGES as MESSAGES, TAX_SOURCE_LABELS } from "../../constants/taxForm";
import type { TaxFormSection } from "../../types/TaxFormSection";

/** Names one copy of a form and says where it came from. Opens the document it was read from, when there is one. */
export default function TaxFormSectionHeader({ section, onViewDocument }: { section: TaxFormSection; onViewDocument: (documentId: string) => void }) {
  const { colors, spacing, fontSize } = useTheme();
  const { document_id: documentId, source_type: sourceType } = section.instance;
  return (
    <View style={{ gap: spacing.xs, paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.xs, backgroundColor: colors.background }}>
      <Text accessibilityRole="header" style={{ fontSize: fontSize.md, fontWeight: "700", color: colors.foreground }}>
        {section.title}
      </Text>
      <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{TAX_SOURCE_LABELS[sourceType]}</Text>
      {documentId ? (
        <Pressable
          accessibilityLabel={`${MESSAGES.viewSource}, ${section.title}`}
          accessibilityRole="link"
          hitSlop={8}
          onPress={() => onViewDocument(documentId)}
          style={{ minHeight: MIN_TOUCH_TARGET, justifyContent: "center" }}
        >
          <Text style={{ fontSize: fontSize.sm, fontWeight: "600", color: colors.primary }}>{MESSAGES.viewSource}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
