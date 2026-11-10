import { LEASE_TEMPLATE_NAME_MAX_LENGTH, LEASE_TEMPLATE_UPLOAD_PROBLEMS } from "@mybookkeeper/api-client/constants/leaseTemplateUpload";
import { leaseTemplateUploadProblems } from "@mybookkeeper/api-client/utils/leaseTemplateUploadForm";
import { Banner, FormField, LoadingButton, useTheme } from "@platform/mobile";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text } from "react-native";
import { LEASE_TEMPLATE_DESCRIPTION_MIN_HEIGHT, LEASE_TEMPLATE_FORM_MESSAGES as MESSAGES, LEASE_TEMPLATE_PICKER_TYPES } from "../../constants/leaseTemplateForm";
import { chooseHeldFile } from "../uploads/pickHeldFile";
import HeldFilesList from "../uploads/HeldFilesList";
import { useHeldFiles } from "../uploads/useHeldFiles";
import LeaseTemplateReading from "./LeaseTemplateReading";
import { useCreateLeaseTemplate } from "./useCreateLeaseTemplate";
import { useUploadLeaveGuard } from "./useUploadLeaveGuard";

/** Uploads a new template. What's chosen is kept here until it's sent, so Try again sends the same files. */
export default function LeaseTemplateFormScreen() {
  const { colors, spacing, fontSize } = useTheme();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [hasTried, setHasTried] = useState(false);
  const [pickFailure, setPickFailure] = useState<string | null>(null);
  const { files, isPicking, pick, drop, forgetAll } = useHeldFiles(setPickFailure);
  const { submit, openNow, isBusy, isReading, isLeaving, message } = useCreateLeaseTemplate(forgetAll);

  const problems = leaseTemplateUploadProblems(name, files);
  const isDirty = name !== "" || description !== "" || files.length > 0;
  const locked = isBusy || isReading || isLeaving;

  useUploadLeaveGuard({ isDirty, isUploading: isBusy, isReading, isLeaving, openNow });

  if (isReading || isLeaving) return <LeaseTemplateReading />;

  function send(): void {
    setHasTried(true);
    if (Object.keys(problems).length > 0) return;
    void submit({ name, description, files });
  }

  const filesProblem = hasTried && problems.files ? LEASE_TEMPLATE_UPLOAD_PROBLEMS[problems.files] : undefined;
  const nameProblem = hasTried && problems.name ? LEASE_TEMPLATE_UPLOAD_PROBLEMS[problems.name] : undefined;
  const failure = message ?? pickFailure;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ gap: spacing.lg, padding: spacing.lg }} contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled">
        {failure ? <Banner message={failure} /> : null}
        <FormField
          editable={!locked}
          error={nameProblem}
          label={MESSAGES.name}
          maxLength={LEASE_TEMPLATE_NAME_MAX_LENGTH}
          onChangeText={setName}
          placeholder={MESSAGES.namePlaceholder}
          required
          value={name}
        />
        <FormField
          editable={!locked}
          hint={MESSAGES.descriptionHint}
          inputStyle={{ minHeight: LEASE_TEMPLATE_DESCRIPTION_MIN_HEIGHT, paddingTop: spacing.md, textAlignVertical: "top" }}
          label={MESSAGES.description}
          multiline
          onChangeText={setDescription}
          value={description}
        />
        <Text accessibilityRole="header" style={{ fontSize: fontSize.lg, fontWeight: "600", color: colors.foreground }}>
          {MESSAGES.files}
        </Text>
        <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{MESSAGES.filesHint}</Text>
        <HeldFilesList emptyText={MESSAGES.noFilesYet} files={files} isDisabled={locked} onRemove={drop} />
        {filesProblem ? (
          <Text accessibilityRole="alert" style={{ fontSize: fontSize.xs, color: colors.destructiveText }}>
            {filesProblem}
          </Text>
        ) : null}
        <LoadingButton disabled={locked} isLoading={isPicking} onPress={() => void pick(() => chooseHeldFile(LEASE_TEMPLATE_PICKER_TYPES))} variant="secondary">
          {files.length > 0 ? MESSAGES.addAnotherFile : MESSAGES.addFile}
        </LoadingButton>
        <LoadingButton disabled={locked || isPicking} isLoading={isBusy} loadingText={MESSAGES.uploading} onPress={send}>
          {MESSAGES.upload}
        </LoadingButton>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
