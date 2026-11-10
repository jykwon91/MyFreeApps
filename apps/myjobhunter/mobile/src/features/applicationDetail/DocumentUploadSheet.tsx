import { DOCUMENT_TITLE_MAX_LENGTH } from "@myjobhunter/api-client/constants/documentFieldLimits";
import { DOCUMENT_KIND_OPTIONS } from "@myjobhunter/api-client/constants/documentKindOptions";
import { useUploadDocumentMutation } from "@myjobhunter/api-client/store/documentsApi";
import type { DocumentKind } from "@myjobhunter/api-client/types/document/document-kind";
import { documentUploadProblem } from "@myjobhunter/api-client/utils/documentUploadProblem";
import { fillDocumentUploadForm } from "@myjobhunter/api-client/utils/fillDocumentUploadForm";
import { formatFileSize } from "@platform/core/utils/fileSize";
import { filePart, FormField, FormSheet, LoadingButton, useTheme, useToast, type FileForUpload } from "@platform/mobile";
import { useState } from "react";
import { Text, View } from "react-native";
import { APPLICATION_DOCUMENT_MESSAGES as MESSAGES } from "../../constants/applicationDocuments";
import { documentUploadFailure } from "../../lib/documentUploadFailure";
import { pickDocumentFile } from "../../lib/pickDocumentFile";
import type { DocumentUploadSheetProps } from "../../types/DocumentUploadSheetProps";
import ChoiceGroup from "./ChoiceGroup";
import FieldError from "./FieldError";
import SheetButtons from "./SheetButtons";

/** The website's file upload: a PDF, DOCX or TXT up to 25 MB, with a title and type, for this application. */
export default function DocumentUploadSheet({ applicationId, onClose }: DocumentUploadSheetProps) {
  const { colors, spacing, fontSize } = useTheme();
  const { showToast } = useToast();
  const [uploadDocument, { isLoading: isUploading }] = useUploadDocumentMutation();
  const [file, setFile] = useState<FileForUpload | null>(null);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<DocumentKind>("cover_letter");
  const [isPicking, setIsPicking] = useState(false);
  const [hasTried, setHasTried] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const isBusy = isUploading || isPicking;
  const titleError = hasTried && title.trim() === "" ? MESSAGES.titleRequired : undefined;
  const fileError = hasTried && !file ? MESSAGES.fileRequired : undefined;

  async function choose(): Promise<void> {
    setIsPicking(true);
    try {
      const picked = await pickDocumentFile();
      // Backing out of the picker keeps whatever was chosen before.
      if (!picked) return;
      const problem = documentUploadProblem(picked);
      if (problem) {
        setFailure(documentUploadFailure(problem));
        return;
      }
      setFailure(null);
      setFile(picked);
    } catch {
      setFailure(MESSAGES.couldntPick);
    } finally {
      setIsPicking(false);
    }
  }

  async function upload(): Promise<void> {
    setHasTried(true);
    if (!file || title.trim() === "") return;
    setFailure(null);
    const form = new FormData();
    // React Native's FormData sends a { uri, name, type } part, which its types call a string.
    fillDocumentUploadForm<string>(form, { title: title.trim(), kind, application_id: applicationId, file: filePart(file) });
    try {
      await uploadDocument(form).unwrap();
      onClose();
      showToast(MESSAGES.uploaded);
    } catch (error) {
      setFailure(documentUploadFailure(null, error));
    }
  }

  return (
    <FormSheet failure={failure} isOpen onRequestClose={() => (isBusy ? undefined : onClose())} title={MESSAGES.uploadTitle}>
      <View style={{ gap: spacing.xs }}>
        <Text style={{ fontSize: fontSize.xs, fontWeight: "500", color: colors.foreground }}>
          {MESSAGES.fileLabel}
          <Text style={{ color: colors.destructiveText }}> *</Text>
        </Text>
        <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{MESSAGES.fileHint}</Text>
        {file ? (
          <Text style={{ fontSize: fontSize.md, color: colors.foreground }} testID="upload-file">
            {file.size == null ? file.name : `${file.name} (${formatFileSize(file.size)})`}
          </Text>
        ) : null}
        <LoadingButton disabled={isUploading} isLoading={isPicking} loadingText={MESSAGES.choosing} onPress={choose} variant="secondary">
          {file ? MESSAGES.chooseAnother : MESSAGES.chooseFile}
        </LoadingButton>
        <FieldError message={fileError} />
      </View>
      <FormField editable={!isBusy} error={titleError} label={MESSAGES.titleLabel} maxLength={DOCUMENT_TITLE_MAX_LENGTH} onChangeText={setTitle} placeholder={MESSAGES.titlePlaceholder} required value={title} />
      <ChoiceGroup disabled={isBusy} label={MESSAGES.kindLabel} onChange={setKind} options={DOCUMENT_KIND_OPTIONS} required value={kind} />
      {/* Nothing to press while the picker is up; Cancel also waits out an upload, as closing the sheet does. */}
      <SheetButtons
        cancelLabel={MESSAGES.cancel}
        disabled={isPicking}
        isSubmitting={isUploading}
        onCancel={onClose}
        onSubmit={upload}
        submitLabel={MESSAGES.uploadSubmit}
        submittingLabel={MESSAGES.uploading}
      />
    </FormSheet>
  );
}
