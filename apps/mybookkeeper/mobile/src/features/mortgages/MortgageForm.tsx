import type { Mortgage } from "@mybookkeeper/api-client/types/mortgage/mortgage";
import type { MortgageDraft } from "@mybookkeeper/api-client/types/mortgage/mortgage-draft";
import type { MortgageFormValues } from "@mybookkeeper/api-client/types/mortgage/mortgage-form-values";
import { applyMortgageDraftToForm } from "@mybookkeeper/api-client/utils/mortgageDraft";
import { EMPTY_MORTGAGE_FORM, mortgageToFormValues } from "@mybookkeeper/api-client/utils/mortgageForm";
import { mortgageFormProblems } from "@mybookkeeper/api-client/utils/mortgageFormProblems";
import { Banner, LoadingButton, useTheme } from "@platform/mobile";
import { useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { MORTGAGE_FORM_MESSAGES as MESSAGES } from "../../constants/mortgageForm";
import { useConfirmLeave } from "../../lib/useConfirmLeave";
import TransactionFact from "../transactions/TransactionFact";
import MortgageDraftNotices from "./MortgageDraftNotices";
import MortgageFormFields from "./MortgageFormFields";
import { sameFormValues } from "./mortgageFormState";
import MortgagePropertyField from "./MortgagePropertyField";
import MortgageStatementReader from "./MortgageStatementReader";
import { useSaveMortgage } from "./useSaveMortgage";

/** Adds a loan, or changes `original`. Values live here so a reload can't overwrite typing. */
export default function MortgageForm({ original }: { original: Mortgage | null }) {
  const { spacing } = useTheme();
  const [values, setValues] = useState<MortgageFormValues>(() => (original ? mortgageToFormValues(original) : EMPTY_MORTGAGE_FORM));
  const [propertyId, setPropertyId] = useState("");
  const [draft, setDraft] = useState<MortgageDraft | null>(null);
  const [hasTried, setHasTried] = useState(false);
  const { save, isBusy, isLeaving, failure } = useSaveMortgage(original);

  const problems = mortgageFormProblems(values);
  const needsProperty = !original && propertyId === "";
  const isDirty = original
    ? !sameFormValues(values, mortgageToFormValues(original))
    : propertyId !== "" || !sameFormValues(values, EMPTY_MORTGAGE_FORM);

  useConfirmLeave(isDirty && !isLeaving, (leave) => {
    if (isBusy) return;
    Alert.alert(MESSAGES.discardTitle, MESSAGES.discardBody, [
      { text: MESSAGES.keepEditing, style: "cancel" },
      { text: MESSAGES.discard, style: "destructive", onPress: leave },
    ]);
  });

  function submit(): void {
    setHasTried(true);
    if (needsProperty || Object.keys(problems).length > 0) return;
    void save({ values, propertyId, sourceDocumentId: draft?.source_document_id ?? null });
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ gap: spacing.lg, padding: spacing.lg }} contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled">
        {failure ? <Banner message={failure} /> : null}
        {original ? (
          <TransactionFact label={MESSAGES.property} value={original.property_name ?? ""} />
        ) : (
          <>
            <MortgageStatementReader
              isDisabled={isBusy}
              onRead={(read) => {
                setDraft(read);
                setValues((current) => applyMortgageDraftToForm(current, read));
              }}
            />
            {draft ? <MortgageDraftNotices draft={draft} /> : null}
            <MortgagePropertyField disabled={isBusy} error={hasTried && needsProperty ? MESSAGES.propertyRequired : undefined} onChange={setPropertyId} value={propertyId} />
          </>
        )}
        <MortgageFormFields
          isBusy={isBusy}
          onChange={(field, value) => setValues((current) => ({ ...current, [field]: value }))}
          problems={hasTried ? problems : {}}
          values={values}
        />
        <LoadingButton disabled={isBusy || isLeaving} isLoading={isBusy} loadingText={MESSAGES.saving} onPress={submit}>
          {original ? MESSAGES.saveEdit : MESSAGES.saveNew}
        </LoadingButton>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
