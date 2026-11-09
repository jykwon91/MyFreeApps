import { LEASE_NOTES_MAX_LENGTH } from "@mybookkeeper/api-client/constants/leaseLabels";
import type { LeaseImportFormValues } from "@mybookkeeper/api-client/types/lease/lease-import-form-values";
import { EMPTY_LEASE_IMPORT_FORM, leaseImportProblems } from "@mybookkeeper/api-client/utils/leaseImportForm";
import { Banner, EmptyState, FormField, LoadingButton, useTheme } from "@platform/mobile";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text } from "react-native";
import { LEASE_IMPORT_MESSAGES as MESSAGES, LEASE_IMPORT_PROBLEM_MESSAGES } from "../../constants/leaseImport";
import { LEASE_FILE_TYPES } from "../../constants/leases";
import { useDiscardPrompt } from "../../lib/useDiscardPrompt";
import OptionalDateField from "../shell/OptionalDateField";
import HeldFileButtons from "../uploads/HeldFileButtons";
import HeldFilesList from "../uploads/HeldFilesList";
import { useHeldFiles } from "../uploads/useHeldFiles";
import { useCanWrite } from "../workspace/useCanWrite";
import LeaseApplicantField from "./LeaseApplicantField";
import LeaseListingField from "./LeaseListingField";
import { useImportLease } from "./useImportLease";

const NOTES_MIN_HEIGHT = 96;

/** Adds a lease that was signed outside the app: who signed it, its dates, and the files. */
export default function LeaseImportScreen() {
  const { colors, spacing, fontSize } = useTheme();
  const canWrite = useCanWrite();
  const [values, setValues] = useState<LeaseImportFormValues>(EMPTY_LEASE_IMPORT_FORM);
  const [hasTried, setHasTried] = useState(false);
  const [pickFailure, setPickFailure] = useState<string | null>(null);
  const held = useHeldFiles(setPickFailure);
  const { submit, isBusy, isLeaving, failure } = useImportLease();

  const problems = leaseImportProblems(values, held.files.length);
  const isDirty = held.files.length > 0 || values.applicantId !== "" || values.listingId !== "" || values.startsOn !== "" || values.endsOn !== "" || values.notes !== "";
  const banner = failure ?? pickFailure;
  const locked = isBusy || isLeaving;
  const problemFor = (field: keyof typeof problems) => (hasTried && problems[field] ? LEASE_IMPORT_PROBLEM_MESSAGES[field] : undefined);

  useDiscardPrompt(isDirty && !isLeaving, isBusy);

  if (!canWrite) return <EmptyState body={MESSAGES.viewOnly} heading={MESSAGES.title} />;

  function edit<Field extends keyof LeaseImportFormValues>(field: Field, value: LeaseImportFormValues[Field]): void {
    setValues((current) => ({ ...current, [field]: value }));
  }

  function importLease(): void {
    setHasTried(true);
    if (Object.keys(problems).length > 0) return;
    void submit(values, held.files);
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ gap: spacing.lg, padding: spacing.lg }} contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled" testID="lease-import">
        <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{MESSAGES.intro}</Text>
        {banner ? <Banner message={banner} /> : null}
        <LeaseApplicantField disabled={locked} error={problemFor("applicantId")} onChange={(applicantId) => edit("applicantId", applicantId)} value={values.applicantId} />
        <LeaseListingField disabled={locked} onChange={(listingId) => edit("listingId", listingId)} value={values.listingId} />
        <OptionalDateField label={MESSAGES.startsOn} onChange={(iso) => edit("startsOn", iso ?? "")} startsAt={new Date()} value={values.startsOn || null} />
        <OptionalDateField error={problemFor("endsOn")} label={MESSAGES.endsOn} onChange={(iso) => edit("endsOn", iso ?? "")} startsAt={new Date()} value={values.endsOn || null} />
        <FormField
          editable={!locked}
          error={problemFor("notes")}
          inputStyle={{ minHeight: NOTES_MIN_HEIGHT, paddingTop: spacing.md, textAlignVertical: "top" }}
          label={MESSAGES.notes}
          maxLength={LEASE_NOTES_MAX_LENGTH}
          multiline
          onChangeText={(text) => edit("notes", text)}
          placeholder={MESSAGES.notesPlaceholder}
          value={values.notes}
        />
        <Text accessibilityRole="header" style={{ fontSize: fontSize.md, fontWeight: "600", color: colors.foreground }}>
          {MESSAGES.files}
        </Text>
        <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{MESSAGES.filesHint}</Text>
        <HeldFilesList emptyText={MESSAGES.noFiles} files={held.files} firstFileNote={MESSAGES.signedLeaseTag} isDisabled={locked} onRemove={held.drop} />
        {problemFor("files") ? (
          <Text accessibilityRole="alert" style={{ fontSize: fontSize.sm, color: colors.destructiveText }}>
            {problemFor("files")}
          </Text>
        ) : null}
        <HeldFileButtons
          file={null}
          fileTypes={LEASE_FILE_TYPES}
          isDisabled={locked}
          isPicking={held.isPicking}
          onPick={(from) => void held.pick(from)}
          photoName={MESSAGES.photoName}
          takePhotoLabel={MESSAGES.takePhoto}
        />
        <LoadingButton disabled={locked || held.isPicking} isLoading={isBusy} loadingText={MESSAGES.submitting} onPress={importLease}>
          {MESSAGES.submit}
        </LoadingButton>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
