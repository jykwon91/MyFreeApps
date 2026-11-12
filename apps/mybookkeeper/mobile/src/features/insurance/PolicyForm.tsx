import { useCreateInsurancePolicyMutation, useUpdateInsurancePolicyMutation } from "@mybookkeeper/api-client/store/insurancePoliciesApi";
import type { InsurancePolicyDetail } from "@mybookkeeper/api-client/types/insurance/insurance-policy-detail";
import type { InsurancePolicyDraft } from "@mybookkeeper/api-client/types/insurance/insurance-policy-draft";
import type { InsurancePolicyFormValues } from "@mybookkeeper/api-client/types/insurance/insurance-policy-form-values";
import { applyDraftToForm } from "@mybookkeeper/api-client/utils/insurancePolicyDraft";
import { EMPTY_POLICY_FORM, policyToFormValues, toPolicyPayload } from "@mybookkeeper/api-client/utils/insurancePolicyForm";
import { INSURANCE_UPLOAD_MIME_TYPES } from "@mybookkeeper/api-client/constants/insuranceUploads";
import { Banner, KeyboardAwareScroll, LoadingButton, useDiscardPrompt, useTheme, useToast } from "@platform/mobile";
import { router } from "expo-router";
import { useEffect, useState } from "react";

import { POLICY_FORM_MESSAGES, POLICY_PHOTO_NAME, POLICY_PROPERTY_MESSAGES, POLICY_READER_MESSAGES } from "../../constants/insuranceForm";
import { sameFormValues } from "../../lib/sameFormValues";
import type { PolicyFormErrors } from "../../types/PolicyFormErrors";
import { useFormSubmit } from "../shell/useFormSubmit";
import DocumentDraftNotices from "../documentReader/DocumentDraftNotices";
import DocumentReader from "../documentReader/DocumentReader";
import PropertyChoiceField from "../properties/PropertyChoiceField";
import PickerField from "../transactions/PickerField";
import { policyAddFailure, policyEditFailure } from "./policyFailure";
import PolicyFormFields from "./PolicyFormFields";
import { policyFormErrors } from "./policyFormErrors";
import { useInsurancePolicyReaders } from "./useInsurancePolicyReaders";

/** Adds a policy, or edits `policy` when it is given. The property can't change once a policy exists. */
export default function PolicyForm({ policy }: { policy?: InsurancePolicyDetail }) {
  const { spacing } = useTheme();
  const { showToast } = useToast();
  const [createPolicy] = useCreateInsurancePolicyMutation();
  const [updatePolicy] = useUpdateInsurancePolicyMutation();
  const readers = useInsurancePolicyReaders();
  const { isBusy, failure, clearFailure, submit } = useFormSubmit();
  const [initial] = useState(() => (policy ? policyToFormValues(policy) : EMPTY_POLICY_FORM));
  const [values, setValues] = useState<InsurancePolicyFormValues>(initial);
  const [propertyId, setPropertyId] = useState(policy?.property_id ?? "");
  const [draft, setDraft] = useState<InsurancePolicyDraft | null>(null);
  const [errors, setErrors] = useState<PolicyFormErrors>({});
  const [isLeaving, setIsLeaving] = useState(false);

  const isDirty = !sameFormValues(values, initial) || (!policy && propertyId !== "");
  const locked = isBusy || isLeaving;

  useDiscardPrompt(isDirty && !isLeaving, isBusy);

  // Leaving waits a render, or the discard prompt still sees the unsaved changes.
  useEffect(() => {
    if (isLeaving) router.back();
  }, [isLeaving]);

  function change(next: Partial<InsurancePolicyFormValues>): void {
    setValues((current) => ({ ...current, ...next }));
  }

  function read(read: InsurancePolicyDraft): void {
    setDraft(read);
    setValues((current) => applyDraftToForm(current, read));
  }

  async function save(): Promise<void> {
    const found = policyFormErrors(values, policy ? null : propertyId);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    const saved = await submit(
      () =>
        policy
          ? updatePolicy({ policyId: policy.id, data: toPolicyPayload(values) }).unwrap()
          : createPolicy({
              property_id: propertyId,
              ...toPolicyPayload(values),
              // Only when the form was seeded from a document, so the policy cites what it was read from.
              ...(draft ? { source_document_id: draft.source_document_id } : {}),
            }).unwrap(),
      policy ? policyEditFailure : policyAddFailure,
    );
    if (!saved) return;
    showToast(policy ? POLICY_FORM_MESSAGES.updated : POLICY_FORM_MESSAGES.added);
    setIsLeaving(true);
  }

  return (
    <KeyboardAwareScroll contentContainerStyle={{ gap: spacing.lg, padding: spacing.lg }} contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled">
      {failure ? <Banner message={failure} /> : null}
      {policy ? (
        <PickerField disabled label={POLICY_FORM_MESSAGES.property} onPress={() => undefined} value={policy.property_name ?? ""} />
      ) : (
        <>
          <DocumentReader
            fileTypes={INSURANCE_UPLOAD_MIME_TYPES}
            isDisabled={locked}
            messages={POLICY_READER_MESSAGES}
            onRead={read}
            photoName={POLICY_PHOTO_NAME}
            readers={readers}
          />
          {draft ? <DocumentDraftNotices draft={draft} messages={POLICY_READER_MESSAGES} /> : null}
          <PropertyChoiceField
            disabled={locked}
            error={errors.propertyId}
            messages={POLICY_PROPERTY_MESSAGES}
            onChange={setPropertyId}
            value={propertyId}
          />
        </>
      )}
      <PolicyFormFields errors={errors} onChange={(next) => { clearFailure(); change(next); }} values={values} />
      <LoadingButton disabled={locked} isLoading={isBusy} loadingText={POLICY_FORM_MESSAGES.saving} onPress={() => void save()}>
        {policy ? POLICY_FORM_MESSAGES.saveChanges : POLICY_FORM_MESSAGES.save}
      </LoadingButton>
    </KeyboardAwareScroll>
  );
}
