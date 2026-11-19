import { EmptyState, useTheme } from "@platform/mobile";
import { Text } from "react-native";
import { DOCUMENT_LIST_MESSAGES } from "../../constants/documents";
import type { DocumentsListEmptyProps } from "../../types/DocumentsListEmptyProps";
import DocumentsSkeleton from "./DocumentsSkeleton";

/** What the list shows with no rows: its skeleton while new filters load, the load failure, or "Nothing matches that." */
export default function DocumentsListEmpty({ isFiltering, loadFailed, onRetry }: DocumentsListEmptyProps) {
  const { colors, fontSize, spacing } = useTheme();
  if (isFiltering) return <DocumentsSkeleton />;
  if (loadFailed) {
    return (
      <EmptyState
        action={{ label: DOCUMENT_LIST_MESSAGES.tryAgain, onPress: onRetry }}
        body={DOCUMENT_LIST_MESSAGES.loadFailedBody}
        heading={DOCUMENT_LIST_MESSAGES.loadFailedHeading}
      />
    );
  }
  return (
    <Text style={{ padding: spacing.lg, fontSize: fontSize.md, color: colors.mutedForeground }}>
      {DOCUMENT_LIST_MESSAGES.nothingMatches}
    </Text>
  );
}
