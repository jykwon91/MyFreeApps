import type { Document } from "@mybookkeeper/api-client/types/document/document";
import { MIN_TOUCH_TARGET, useTheme } from "@platform/mobile";
import { Pressable, Text, View } from "react-native";
import { DOCUMENT_BULK_MESSAGES } from "../../constants/documentBulk";
import { DOCUMENT_LIST_MESSAGES } from "../../constants/documents";
import { timeSince } from "@platform/core/utils/timeSince";
import { documentName, documentSourceLabel, documentStatusLabel, documentStatusLine, documentTypeLabel } from "./documentDisplay";
import DocumentReferenceChip from "./DocumentReferenceChip";
import DocumentStatusChip from "./DocumentStatusChip";

export default function DocumentRow({
  document,
  onPress,
  onLongPress,
  isSelected,
  isUnselectable = false,
}: {
  document: Document;
  onPress: () => void;
  /** Starts picking several, from this one. Not offered to someone who can't change anything. */
  onLongPress?: () => void;
  /** Set while picking several: the row then ticks on and off instead of opening. */
  isSelected?: boolean;
  /** While picking, a document that is being read (or deleted) can't be ticked. */
  isUnselectable?: boolean;
}) {
  const isPicking = isSelected !== undefined;
  const { colors, spacing, fontSize } = useTheme();
  const name = documentName(document);
  const type = documentTypeLabel(document);
  const when = timeSince(document.created_at);
  const statusLine = documentStatusLine(document);
  const source = documentSourceLabel(document);
  const details = [type, source, when].join(" · ");
  const label = [name, type, source, document.is_escrow_paid ? DOCUMENT_LIST_MESSAGES.reference : null, documentStatusLabel(document), when]
    .filter(Boolean)
    .join(", ");

  return (
    <Pressable
      accessibilityHint={onLongPress && !isPicking ? DOCUMENT_BULK_MESSAGES.hintLongPress : undefined}
      accessibilityLabel={label}
      accessibilityRole={isPicking ? "checkbox" : "button"}
      accessibilityState={isPicking ? { checked: isSelected, disabled: isUnselectable } : undefined}
      disabled={isUnselectable}
      onLongPress={isPicking ? undefined : onLongPress}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: MIN_TOUCH_TARGET,
        gap: spacing.xs,
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        backgroundColor: pressed ? colors.muted : colors.background,
        opacity: isUnselectable ? 0.5 : 1,
      })}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
        {isPicking ? (
          <Text accessibilityElementsHidden importantForAccessibility="no" style={{ fontSize: fontSize.md, color: isSelected ? colors.primary : colors.mutedForeground }}>
            {isSelected ? "☑" : "☐"}
          </Text>
        ) : null}
        <Text
          ellipsizeMode="middle"
          numberOfLines={1}
          style={{ flex: 1, fontSize: fontSize.md, fontWeight: "600", color: colors.foreground }}
        >
          {name}
        </Text>
        {document.is_escrow_paid ? <DocumentReferenceChip /> : null}
        <DocumentStatusChip document={document} />
      </View>
      <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{details}</Text>
      {statusLine ? <Text style={{ fontSize: fontSize.sm, color: colors.foreground }}>{statusLine}</Text> : null}
      {document.status === "failed" && document.error_message ? (
        <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{document.error_message}</Text>
      ) : null}
    </Pressable>
  );
}
