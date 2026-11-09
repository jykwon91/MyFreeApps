import { useCreateInsurancePolicyMutation, useUpdateInsurancePolicyMutation } from "@mybookkeeper/api-client/store/insurancePoliciesApi";
import { useGetPropertiesQuery } from "@mybookkeeper/api-client/store/propertiesApi";
import type { InsurancePolicyDetail } from "@mybookkeeper/api-client/types/insurance/insurance-policy-detail";
import type { InsurancePolicyDraft } from "@mybookkeeper/api-client/types/insurance/insurance-policy-draft";
import type { InsurancePolicyFormValues } from "@mybookkeeper/api-client/types/insurance/insurance-policy-form-values";
import { applyDraftToForm } from "@mybookkeeper/api-client/utils/insurancePolicyDraft";
import { EMPTY_POLICY_FORM, policyToFormValues, toPolicyPayload } from "@mybookkeeper/api-client/utils/insurancePolicyForm";
import { Banner, EmptyState, LoadingButton, OptionSheet, useTheme, useToast } from "@platform/mobile";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { POLICY_FORM_MESSAGES } from "../../constants/insuranceForm";
import { useConfirmLeave } from "../../lib/useConfirmLeave";
import type { PolicyFormErrors } from "../../types/PolicyFormErrors";
import { useFormSubmit } from "../shell/useFormSubmit";
import PickerField from "../transactions/PickerField";
import PolicyDocumentReader from "./PolicyDocumentReader";
import PolicyDraftNotices from "./PolicyDraftNotices";
import { policyAddFailure, policyEditFailure } from "./policyFailure";
import PolicyFormFields from "./PolicyFormFields";
import { policyFormErrors } from "./policyFormErrors";
import PoliciesSkeleton from "./PoliciesSkeleton";

/** Adds a policy, or edits `policy` when it is given. The property can't change once a policy exists. */
export default function PolicyForm({ policy }: { policy?: InsurancePolicyDetail }) {
  const { spacing } = useTheme();
  const { showToast } = useToast();
  const { data: properties, isLoading: isLoadingProperties, isError: couldntLoadProperties, refetch } = useGetPropertiesQuery();
  const [createPolicy] = useCreateInsurancePolicyMutation();
  const [updatePolicy] = useUpdateInsurancePolicyMutation();
  const { isBusy, failure, clearFailure, submit } = useFormSubmit();
  const [initial] = useState(() => (policy ? policyToFormValues(policy) : EMPTY_POLICY_FORM));
  const [values, setValues] = useState<InsurancePolicyFormValues>(initial);
  const [propertyId, setPropertyId] = useState(policy?.property_id ?? "");
  const [draft, setDraft] = useState<InsurancePolicyDraft | null>(null);
  const [errors, setErrors] = useState<PolicyFormErrors>({});
  const [isPropertyOpen, setIsPropertyOpen] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);

  const isDirty = JSON.stringify(values) !== JSON.stringify(initial) || (!policy && propertyId !== "");

  useConfirmLeave(isDirty && !isLeaving, (leave) => {
    if (isBusy) return;
    Alert.alert(POLICY_FORM_MESSAGES.discardTitle, POLICY_FORM_MESSAGES.discardBody, [
      { text: POLICY_FORM_MESSAGES.keepEditing, style: "cancel" },
      { text: POLICY_FORM_MESSAGES.discard, style: "destructive", onPress: leave },
    ]);
  });

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

  if (!policy && isLoadingProperties) return <PoliciesSkeleton />;
  if (!policy && couldntLoadProperties) {
    return <EmptyState action={{ label: POLICY_FORM_MESSAGES.tryAgain, onPress: () => void refetch() }} body={POLICY_FORM_MESSAGES.tryAgainOffer} heading={POLICY_FORM_MESSAGES.couldntLoadProperties} />;
  }
  if (!policy && properties?.length === 0) {
    return (
      <EmptyState
        action={{ label: POLICY_FORM_MESSAGES.addProperty, onPress: () => router.push("/properties/new") }}
        body={POLICY_FORM_MESSAGES.noPropertiesBody}
        heading={POLICY_FORM_MESSAGES.noPropertiesHeading}
      />
    );
  }

  const propertyName = policy?.property_name ?? properties?.find((property) => property.id === propertyId)?.name;
  const choosable = (properties ?? []).filter((property) => property.is_active);

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ gap: spacing.lg, padding: spacing.lg }} contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled">
        {failure ? <Banner message={failure} /> : null}
        {policy ? null : <PolicyDocumentReader isDisabled={isBusy} onRead={read} />}
        {draft ? <PolicyDraftNotices draft={draft} /> : null}
        {policy ? (
          <PickerField disabled label={POLICY_FORM_MESSAGES.property} onPress={() => undefined} value={propertyName ?? ""} />
        ) : (
          <>
            <PickerField label={POLICY_FORM_MESSAGES.property} onPress={() => setIsPropertyOpen(true)} value={propertyName ?? POLICY_FORM_MESSAGES.chooseProperty} />
            {errors.propertyId ? <Banner message={errors.propertyId} /> : null}
          </>
        )}
        <PolicyFormFields errors={errors} onChange={(next) => { clearFailure(); change(next); }} values={values} />
        <LoadingButton disabled={isBusy} isLoading={isBusy} loadingText={POLICY_FORM_MESSAGES.saving} onPress={() => void save()}>
          {policy ? POLICY_FORM_MESSAGES.saveChanges : POLICY_FORM_MESSAGES.save}
        </LoadingButton>
      </ScrollView>
      <OptionSheet
        isOpen={isPropertyOpen}
        onClose={() => setIsPropertyOpen(false)}
        onSelect={(id) => {
          setIsPropertyOpen(false);
          setPropertyId(id);
        }}
        options={choosable.map((property) => ({ value: property.id, label: property.name }))}
        title={POLICY_FORM_MESSAGES.chooseProperty}
        value={propertyId === "" ? null : propertyId}
      />
    </KeyboardAvoidingView>
  );
}
