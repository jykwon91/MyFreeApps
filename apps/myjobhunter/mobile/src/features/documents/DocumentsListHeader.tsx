import { Banner, LoadingButton, SHOWING_LAST_LOADED_MESSAGE, useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { DOCUMENT_MESSAGES } from "../../constants/documents";
import { DOCUMENTS_SCREEN_MESSAGES as MESSAGES, SUBTITLE_LINE_HEIGHT } from "../../constants/documentsScreen";
import type { DocumentsListHeaderProps } from "../../types/DocumentsListHeaderProps";

/** The website's page subtitle and Add document, as Upload and Write side by side, then its type filter. */
export default function DocumentsListHeader({ isStale, kindLabel, onUpload, onWrite, onChooseKind }: DocumentsListHeaderProps) {
  const { colors, spacing, fontSize } = useTheme();
  return (
    <View style={{ gap: spacing.md, paddingBottom: spacing.md }}>
      {isStale ? <Banner message={SHOWING_LAST_LOADED_MESSAGE} /> : null}
      <Text style={{ fontSize: fontSize.sm, lineHeight: SUBTITLE_LINE_HEIGHT, color: colors.mutedForeground }}>{MESSAGES.subtitle}</Text>
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <LoadingButton onPress={onUpload} style={{ flex: 1 }}>
          {DOCUMENT_MESSAGES.upload}
        </LoadingButton>
        <LoadingButton onPress={onWrite} style={{ flex: 1 }} variant="secondary">
          {DOCUMENT_MESSAGES.add}
        </LoadingButton>
      </View>
      <LoadingButton onPress={onChooseKind} variant="secondary">
        {`${MESSAGES.kindFilter}: ${kindLabel}`}
      </LoadingButton>
    </View>
  );
}
