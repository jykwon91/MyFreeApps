import type { UtilityPlanDetail } from "@mybookkeeper/api-client/types/utility/utility-plan-detail";
import type { UtilityPlanDraft } from "@mybookkeeper/api-client/types/utility/utility-plan-draft";
import type { UtilityPlanFormValues } from "@mybookkeeper/api-client/types/utility/utility-plan-form-values";
import { UTILITY_SERVICE_TYPES, UTILITY_SERVICE_TYPE_LABELS } from "@mybookkeeper/api-client/constants/utilityServiceTypes";
import type { UtilityServiceType } from "@mybookkeeper/api-client/types/utility/utility-service-type";
import { applyDraftToForm } from "@mybookkeeper/api-client/utils/utilityPlanDraft";
import { EMPTY_UTILITY_PLAN_FORM, toUtilityPlanFormValues, utilityPlanFormProblems } from "@mybookkeeper/api-client/utils/utilityPlanForm";
import { Banner, LoadingButton, OptionSheet, useDiscardPrompt, useTheme } from "@platform/mobile";
import { useState } from "react";
import { ScrollView } from "react-native";
import {
  UTILITY_PLAN_FORM_MESSAGES as MESSAGES,
  UTILITY_PLAN_PHOTO_NAME,
  UTILITY_PLAN_PROPERTY_MESSAGES,
  UTILITY_PLAN_READER_MESSAGES,
} from "../../constants/utilityPlanForm";
import { sameFormValues } from "../../lib/sameFormValues";
import type { UtilityPlanFieldChange } from "../../types/UtilityPlanFieldChange";
import DocumentDraftNotices from "../documentReader/DocumentDraftNotices";
import DocumentReader from "../documentReader/DocumentReader";
import PropertyChoiceField from "../properties/PropertyChoiceField";
import TransactionFact from "../transactions/TransactionFact";
import UtilityPlanFormFields from "./UtilityPlanFormFields";
import { useSaveUtilityPlan } from "./useSaveUtilityPlan";
import { useUtilityPlanReaders } from "./useUtilityPlanReaders";

const SERVICE_OPTIONS = UTILITY_SERVICE_TYPES.map((service) => ({ value: service, label: UTILITY_SERVICE_TYPE_LABELS[service] }));

/** Adds a plan, or changes `original`. Values live here so a reload can't overwrite typing. */
export default function UtilityPlanForm({ original }: { original: UtilityPlanDetail | null }) {
  const { spacing } = useTheme();
  const saved = original ? toUtilityPlanFormValues(original) : EMPTY_UTILITY_PLAN_FORM;
  const [values, setValues] = useState<UtilityPlanFormValues>(saved);
  const [propertyId, setPropertyId] = useState("");
  const [draft, setDraft] = useState<UtilityPlanDraft | null>(null);
  const [hasTried, setHasTried] = useState(false);
  const [isPickingService, setIsPickingService] = useState(false);
  const readers = useUtilityPlanReaders();
  const { save, isBusy, isLeaving, failure } = useSaveUtilityPlan(original);

  const problems = utilityPlanFormProblems(values);
  const needsProperty = !original && propertyId === "";
  const isDirty = !sameFormValues(values, saved) || propertyId !== "";
  const locked = isBusy || isLeaving;

  useDiscardPrompt(isDirty && !isLeaving, isBusy);

  const change: UtilityPlanFieldChange = (field, value) => setValues((current) => ({ ...current, [field]: value }));

  function submit(): void {
    setHasTried(true);
    if (needsProperty || Object.keys(problems).length > 0) return;
    void save({ values, propertyId, sourceDocumentId: draft?.source_document_id ?? null });
  }

  return (
    <>
      <ScrollView automaticallyAdjustKeyboardInsets contentContainerStyle={{ gap: spacing.lg, padding: spacing.lg }} contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled">
        {failure ? <Banner message={failure} /> : null}
        {original ? (
          <TransactionFact label={MESSAGES.property} value={original.property_name ?? ""} />
        ) : (
          <>
            <DocumentReader
              isDisabled={locked}
              messages={UTILITY_PLAN_READER_MESSAGES}
              onRead={(read) => {
                setDraft(read);
                setValues((current) => applyDraftToForm(current, read));
              }}
              photoName={UTILITY_PLAN_PHOTO_NAME}
              readers={readers}
            />
            {draft ? <DocumentDraftNotices draft={draft} messages={UTILITY_PLAN_READER_MESSAGES} /> : null}
            <PropertyChoiceField
              disabled={locked}
              error={hasTried && needsProperty ? MESSAGES.propertyRequired : undefined}
              messages={UTILITY_PLAN_PROPERTY_MESSAGES}
              onChange={setPropertyId}
              value={propertyId}
            />
          </>
        )}
        <UtilityPlanFormFields isBusy={locked} onChange={change} onPickService={() => setIsPickingService(true)} problems={hasTried ? problems : {}} values={values} />
        <LoadingButton disabled={locked} isLoading={isBusy} loadingText={MESSAGES.saving} onPress={submit}>
          {original ? MESSAGES.saveEdit : MESSAGES.saveNew}
        </LoadingButton>
      </ScrollView>
      <OptionSheet<UtilityServiceType>
        isOpen={isPickingService}
        onClose={() => setIsPickingService(false)}
        onSelect={(service) => {
          setIsPickingService(false);
          change("serviceType", service);
        }}
        options={SERVICE_OPTIONS}
        title={MESSAGES.serviceSheetTitle}
        value={values.serviceType}
      />
    </>
  );
}
