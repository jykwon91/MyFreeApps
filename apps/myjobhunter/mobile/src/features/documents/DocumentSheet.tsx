import { DOCUMENT_TITLE_MAX_LENGTH } from "@myjobhunter/api-client/constants/documentFieldLimits";
import { DOCUMENT_KIND_OPTIONS } from "@myjobhunter/api-client/constants/documentKindOptions";
import { useCreateDocumentMutation, useUpdateDocumentMutation } from "@myjobhunter/api-client/store/documentsApi";
import type { DocumentKind } from "@myjobhunter/api-client/types/document/document-kind";
import { characterCounter } from "@platform/core/utils/characterCounter";
import { documentChangesRequest } from "@myjobhunter/api-client/utils/documentChangesRequest";
import { tooLongProblem } from "@platform/core/utils/tooLongProblem";
import { FormField, FormSheet, useTheme, useToast } from "@platform/mobile";
import { useState } from "react";
import { Text } from "react-native";
import { DOCUMENT_MESSAGES as MESSAGES } from "../../constants/documents";
import { writeFailure } from "../../lib/writeFailure";
import type { DocumentSheetProps } from "../../types/DocumentSheetProps";
import ChoiceGroup from "../../components/forms/ChoiceGroup";
import SheetButtons from "../../components/forms/SheetButtons";

/** Writes a text document, linked to the application when given, or edits one: its title, type and (for text) content. */
export default function DocumentSheet({ applicationId, document, onClose }: DocumentSheetProps) {
  const { colors, fontSize } = useTheme();
  const { showToast } = useToast();
  const [createDocument, { isLoading: isCreating }] = useCreateDocumentMutation();
  const [updateDocument, { isLoading: isUpdating }] = useUpdateDocumentMutation();
  const [title, setTitle] = useState(document?.title ?? "");
  const [kind, setKind] = useState<DocumentKind>(document?.kind ?? "cover_letter");
  const [body, setBody] = useState(document?.body ?? "");
  const [hasTried, setHasTried] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const isBusy = isCreating || isUpdating;
  const hasFile = document?.has_file ?? false;
  const titleTooLong = tooLongProblem(title, DOCUMENT_TITLE_MAX_LENGTH);
  const titleError = hasTried && title.trim() === "" ? MESSAGES.titleRequired : titleTooLong;
  const bodyError = hasTried && !document && body.trim() === "" ? MESSAGES.contentRequired : undefined;

  async function save(): Promise<void> {
    setHasTried(true);
    if (title.trim() === "" || titleTooLong || (!document && body.trim() === "")) return;
    setFailure(null);
    try {
      if (document) {
        const patch = documentChangesRequest(document, { title, kind, body });
        if (Object.keys(patch).length > 0) {
          await updateDocument({ id: document.id, patch }).unwrap();
          showToast(MESSAGES.updated);
        }
      } else {
        await createDocument({ title, kind, application_id: applicationId ?? null, body }).unwrap();
        showToast(MESSAGES.created);
      }
      onClose();
    } catch (error) {
      setFailure(writeFailure(error, document ? MESSAGES.couldntUpdate : MESSAGES.couldntCreate));
    }
  }

  return (
    <FormSheet failure={failure} isOpen onRequestClose={() => (isBusy ? undefined : onClose())} title={document ? MESSAGES.editTitle : MESSAGES.addTitle}>
      <FormField counter={characterCounter(title, DOCUMENT_TITLE_MAX_LENGTH)} editable={!isBusy} error={titleError} label={MESSAGES.titleLabel} onChangeText={setTitle} placeholder={MESSAGES.titlePlaceholder} required value={title} />
      <ChoiceGroup disabled={isBusy} label={MESSAGES.kindLabel} onChange={setKind} options={DOCUMENT_KIND_OPTIONS} required value={kind} />
      {hasFile ? (
        <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{`${document?.filename ?? ""} — ${MESSAGES.fileContent}`}</Text>
      ) : (
        <FormField
          editable={!isBusy}
          error={bodyError}
          label={MESSAGES.contentLabel}
          multiline
          onChangeText={setBody}
          placeholder={MESSAGES.contentPlaceholder}
          required={!document}
          value={body}
        />
      )}
      <SheetButtons
        cancelLabel={MESSAGES.cancel}
        isSubmitting={isBusy}
        onCancel={onClose}
        onSubmit={save}
        submitLabel={document ? MESSAGES.saveChanges : MESSAGES.create}
        submittingLabel={document ? MESSAGES.saving : MESSAGES.creating}
      />
    </FormSheet>
  );
}
