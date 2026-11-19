import { LoadingButton, useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import type { DocumentLibraryPlaceholderProps } from "../../types/DocumentLibraryPlaceholderProps";
import DocumentLibrarySkeleton from "./DocumentLibrarySkeleton";

/** What the library sheet shows before its first page is in: the skeleton, or the failure with a retry. */
export default function DocumentLibraryPlaceholder({ messages, isFetching, failed, onRetry }: DocumentLibraryPlaceholderProps) {
  const { colors, spacing, fontSize } = useTheme();
  if (isFetching || !failed) return <DocumentLibrarySkeleton label={messages.libraryLoading} />;
  return (
    <View style={{ gap: spacing.md, padding: spacing.lg }}>
      <Text accessibilityRole="alert" style={{ fontSize: fontSize.md, color: colors.destructiveText }}>
        {messages.libraryFailed}
      </Text>
      <LoadingButton onPress={onRetry} variant="secondary">
        {messages.libraryRetry}
      </LoadingButton>
    </View>
  );
}
