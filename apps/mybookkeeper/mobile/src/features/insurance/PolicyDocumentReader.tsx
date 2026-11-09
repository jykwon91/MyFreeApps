import { INSURANCE_UPLOAD_MIME_TYPES } from "@mybookkeeper/api-client/constants/insuranceUploads";
import type { InsurancePolicyDraft } from "@mybookkeeper/api-client/types/insurance/insurance-policy-draft";
import { Banner, LoadingButton, OptionSheet, useTheme } from "@platform/mobile";
import { useGetDocumentsQuery } from "@mybookkeeper/api-client/store/documentsApi";
import { useState } from "react";
import { Text, View } from "react-native";
import { POLICY_PHOTO_NAME, POLICY_READER_MESSAGES } from "../../constants/insuranceForm";
import { documentName } from "../documents/documentDisplay";
import HeldFileButtons from "../uploads/HeldFileButtons";
import { useHeldFile } from "../uploads/useHeldFile";
import { usePolicyReader } from "./usePolicyReader";

interface PolicyDocumentReaderProps {
  onRead: (draft: InsurancePolicyDraft) => void;
  isDisabled: boolean;
}

/**
 * Picking a document reads it: the card exists to fill the form, so a second button to act on
 * a document already chosen would only ever have one sensible answer.
 */
export default function PolicyDocumentReader({ onRead, isDisabled }: PolicyDocumentReaderProps) {
  const { colors, spacing, fontSize } = useTheme();
  const { data: documents = [] } = useGetDocumentsQuery({ excludeProcessing: true });
  const { source, failure, isReading, read, showFailure, clear } = usePolicyReader(onRead);
  const { file, isPicking, pick, forget } = useHeldFile(showFailure);
  const [isChoosing, setIsChoosing] = useState(false);
  const isBusy = isDisabled || isReading;

  async function pickAndRead(from: Parameters<typeof pick>[0]): Promise<void> {
    const picked = await pick(from);
    if (picked) await read({ kind: "file", file: picked });
  }

  function startOver(): void {
    forget();
    clear();
  }

  return (
    <View style={{ gap: spacing.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: 8 }}>
      <View style={{ gap: spacing.xs }}>
        <Text accessibilityRole="header" style={{ fontSize: fontSize.md, fontWeight: "600", color: colors.foreground }}>
          {POLICY_READER_MESSAGES.heading}
        </Text>
        <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{POLICY_READER_MESSAGES.hint}</Text>
      </View>
      {failure ? <Banner message={failure} /> : null}
      {source ? (
        <View style={{ gap: spacing.sm }}>
          <Text style={{ fontSize: fontSize.md, color: colors.foreground }}>
            {isReading ? POLICY_READER_MESSAGES.reading : `${POLICY_READER_MESSAGES.readFrom} ${source.kind === "file" ? source.file.name : source.name}`}
          </Text>
          {failure ? (
            <LoadingButton isLoading={isReading} loadingText={POLICY_READER_MESSAGES.reading} onPress={() => void read(source)} variant="secondary">
              {POLICY_READER_MESSAGES.tryAgain}
            </LoadingButton>
          ) : null}
          <LoadingButton disabled={isBusy} onPress={startOver} variant="ghost">
            {POLICY_READER_MESSAGES.startOver}
          </LoadingButton>
        </View>
      ) : (
        <>
          <HeldFileButtons
            file={file}
            fileTypes={INSURANCE_UPLOAD_MIME_TYPES}
            isDisabled={isBusy}
            isPicking={isPicking}
            onPick={(from) => void pickAndRead(from)}
            photoName={POLICY_PHOTO_NAME}
            takePhotoLabel={POLICY_READER_MESSAGES.takePhoto}
          />
          {documents.length > 0 ? (
            <LoadingButton disabled={isBusy || isPicking} onPress={() => setIsChoosing(true)} variant="ghost">
              {POLICY_READER_MESSAGES.fromDocuments}
            </LoadingButton>
          ) : null}
        </>
      )}
      <OptionSheet
        emptyText={POLICY_READER_MESSAGES.noDocuments}
        isOpen={isChoosing}
        onClose={() => setIsChoosing(false)}
        onSelect={(id) => {
          setIsChoosing(false);
          const chosen = documents.find((document) => document.id === id);
          if (chosen) void read({ kind: "document", id, name: documentName(chosen) });
        }}
        options={documents.map((document) => ({ value: document.id, label: documentName(document) }))}
        title={POLICY_READER_MESSAGES.documentsTitle}
        value={null}
      />
    </View>
  );
}
