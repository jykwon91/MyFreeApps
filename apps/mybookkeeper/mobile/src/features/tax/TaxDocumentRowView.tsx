import type { TaxSourceDocument } from "@mybookkeeper/api-client/types/tax/TaxSourceDocument";
import { getFormLabel } from "@mybookkeeper/api-client/utils/taxFormLabel";
import { MIN_TOUCH_TARGET, useTheme } from "@platform/mobile";
import { Pressable, Text } from "react-native";
import { TAX_DOCUMENTS_MESSAGES as MESSAGES } from "../../constants/taxDocuments";
import { taxDocumentName } from "./taxDocumentsDisplay";

export default function TaxDocumentRowView({ document, onPress }: { document: TaxSourceDocument; onPress: () => void }) {
  const { colors, spacing, fontSize } = useTheme();
  const name = taxDocumentName(document);
  return (
    <Pressable
      accessibilityLabel={`${getFormLabel(document.document_type)}, ${name}${document.issuer_ein ? `, ${MESSAGES.ein(document.issuer_ein)}` : ""}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: MIN_TOUCH_TARGET,
        justifyContent: "center",
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        backgroundColor: pressed ? colors.muted : colors.background,
      })}
    >
      <Text ellipsizeMode="middle" numberOfLines={1} style={{ fontSize: fontSize.md, color: colors.foreground }}>
        {name}
      </Text>
      {document.issuer_ein ? <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{MESSAGES.ein(document.issuer_ein)}</Text> : null}
    </Pressable>
  );
}
