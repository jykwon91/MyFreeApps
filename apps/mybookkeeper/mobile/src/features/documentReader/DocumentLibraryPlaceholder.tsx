import { SectionError, useTheme } from "@platform/mobile";
import { View } from "react-native";
import type { DocumentLibraryPlaceholderProps } from "../../types/DocumentLibraryPlaceholderProps";
import DocumentLibrarySkeleton from "./DocumentLibrarySkeleton";

/** What the library sheet shows before its first page is in: the skeleton, or the failure with a retry. */
export default function DocumentLibraryPlaceholder({ messages, isFetching, failed, onRetry }: DocumentLibraryPlaceholderProps) {
  const { spacing } = useTheme();
  if (isFetching || !failed) return <DocumentLibrarySkeleton label={messages.libraryLoading} />;
  return (
    <View style={{ padding: spacing.lg }}>
      <SectionError message={messages.libraryFailed} onRetry={onRetry} retryLabel={messages.libraryRetry} />
    </View>
  );
}
