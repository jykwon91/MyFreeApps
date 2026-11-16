import type { Document } from "@mybookkeeper/api-client/types/document/document";
import { LARGE_TEXT_FILE_NAME_LINES, ListRowTitle, MIN_TOUCH_TARGET, useTheme } from "@platform/mobile";
import { memo } from "react";
import { Pressable, Text } from "react-native";
import { DOCUMENT_BULK_MESSAGES } from "../../constants/documentBulk";
import { DOCUMENT_LIST_MESSAGES } from "../../constants/documents";
import { timeSince } from "@platform/core/utils/timeSince";
import { documentName, documentSourceLabel, documentStatusLabel, documentStatusLine, documentTypeLabel } from "./documentDisplay";
import DocumentReferenceChip from "./DocumentReferenceChip";
import DocumentStatusChip from "./DocumentStatusChip";

function DocumentRow({
  document,
  onPress,
  onLongPress,
  isSelected,
  isUnselectable = false,
}: {
  document: Document;
  /** Handed the document's id so one handler serves every row and the row can stay memoized. */
  onPress: (id: string) => void;
  /** Starts picking several, from this one. Not offered to someone who can't change anything. */
  onLongPress?: (id: string) => void;
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
      onLongPress={isPicking || !onLongPress ? undefined : () => onLongPress(document.id)}
      onPress={() => onPress(document.id)}
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
      <ListRowTitle
        align="center"
        aside={
          <>
            {document.is_escrow_paid ? <DocumentReferenceChip /> : null}
            <DocumentStatusChip document={document} />
          </>
        }
        ellipsizeMode="middle"
        largeTextNumberOfLines={LARGE_TEXT_FILE_NAME_LINES}
        leading={
          isPicking ? (
            <Text accessibilityElementsHidden importantForAccessibility="no" style={{ fontSize: fontSize.md, color: isSelected ? colors.primary : colors.mutedForeground }}>
              {isSelected ? "☑" : "☐"}
            </Text>
          ) : null
        }
        title={name}
      />
      <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{details}</Text>
      {statusLine ? <Text style={{ fontSize: fontSize.sm, color: colors.foreground }}>{statusLine}</Text> : null}
      {document.status === "failed" && document.error_message ? (
        <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{document.error_message}</Text>
      ) : null}
    </Pressable>
  );
}

export default memo(DocumentRow);
