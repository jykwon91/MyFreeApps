import { Banner, LoadingButton, useTheme } from "@platform/mobile";
import { useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { DOCUMENT_READER_FILE_TYPES } from "../../constants/documentReader";
import type { DocumentReaderMessages } from "../../types/DocumentReaderMessages";
import type { DocumentReaders } from "../../types/DocumentReaders";
import HeldFileButtons from "../uploads/HeldFileButtons";
import DocumentLibrarySheet from "./DocumentLibrarySheet";
import { useReadDocument } from "./useReadDocument";

interface DocumentReaderProps<TDraft> {
  messages: DocumentReaderMessages;
  readers: DocumentReaders<TDraft>;
  onRead: (draft: TDraft) => void;
  /** The name a photo taken here is saved under. */
  photoName: string;
  /** What may be picked; defaults to what every reader accepts. */
  fileTypes?: readonly string[];
  /** True while the thing being filled in is itself being saved. */
  isDisabled: boolean;
}

/**
 * Fill a form from a document: a photo, a file, or a document already uploaded. What the
 * document is, and what gets read out of it, is up to the caller.
 */
export default function DocumentReader<TDraft>({ messages: MESSAGES, readers, onRead, photoName, fileTypes = DOCUMENT_READER_FILE_TYPES, isDisabled }: DocumentReaderProps<TDraft>) {
  const { colors, spacing, radius, fontSize } = useTheme();
  const reader = useReadDocument(readers, MESSAGES, onRead);
  const [isPickingLibrary, setIsPickingLibrary] = useState(false);
  const isBlocked = isDisabled || reader.isReading;

  return (
    <View style={{ gap: spacing.sm, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md }}>
      <Text accessibilityRole="header" style={{ fontSize: fontSize.md, fontWeight: "600", color: colors.foreground }}>
        {MESSAGES.title}
      </Text>
      <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{MESSAGES.hint}</Text>
      {reader.failure ? <Banner message={reader.failure} /> : null}
      {reader.readName && !reader.failure ? (
        <Text style={{ fontSize: fontSize.sm, color: colors.foreground }}>{MESSAGES.readDone(reader.readName)}</Text>
      ) : null}
      <HeldFileButtons
        file={reader.file}
        fileTypes={fileTypes}
        isDisabled={isBlocked}
        isPicking={reader.isPicking}
        onPick={(from) => void reader.chooseAndRead(from)}
        photoName={photoName}
        takePhotoLabel={MESSAGES.takePhoto}
      />
      <LoadingButton disabled={isBlocked || reader.isPicking} onPress={() => setIsPickingLibrary(true)} variant="secondary">
        {MESSAGES.fromLibrary}
      </LoadingButton>
      {reader.file && reader.failure ? (
        <>
          <LoadingButton isLoading={reader.isReading} loadingText={MESSAGES.reading} onPress={() => void reader.retry()}>
            {MESSAGES.tryAgain}
          </LoadingButton>
          <LoadingButton disabled={reader.isReading} onPress={reader.forget} variant="ghost">
            {MESSAGES.neverMind}
          </LoadingButton>
        </>
      ) : null}
      {reader.isReading ? (
        <View accessibilityLiveRegion="polite" style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
          <ActivityIndicator color={colors.primary} />
          <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{MESSAGES.reading}</Text>
        </View>
      ) : null}
      <DocumentLibrarySheet
        messages={MESSAGES}
        isOpen={isPickingLibrary}
        onClose={() => setIsPickingLibrary(false)}
        onPick={(documentId, name) => {
          setIsPickingLibrary(false);
          void reader.readLibrary(documentId, name);
        }}
      />
    </View>
  );
}
