import { useUpsertInsuranceBenchmarkMutation } from "@mybookkeeper/api-client/store/insuranceBenchmarksApi";
import type { InsuranceBenchmark } from "@mybookkeeper/api-client/types/insurance/insurance-benchmark";
import type { InsuranceBenchmarkFormValues } from "@mybookkeeper/api-client/types/insurance/insurance-benchmark-form-values";
import { benchmarkFormPayload, benchmarkToFormValues } from "@mybookkeeper/api-client/utils/insuranceBenchmarkForm";
import { Banner, FormField, LoadingButton, useTheme, useToast } from "@platform/mobile";
import { useState } from "react";
import { Alert, Modal, ScrollView, Text, View } from "react-native";
import { MARKET_MESSAGES } from "../../constants/insuranceMarket";
import { dateFromIso } from "../../lib/localDate";
import { useTodayIso } from "../../lib/useTodayIso";
import OptionalDateField from "../shell/OptionalDateField";
import { useFormSubmit } from "../shell/useFormSubmit";
import { marketSaveFailure } from "./marketFailure";

interface MarketPremiumSheetProps {
  existing: InsuranceBenchmark | null | undefined;
  onClose: () => void;
}

export default function MarketPremiumSheet({ existing, onClose }: MarketPremiumSheetProps) {
  const { colors, spacing, fontSize } = useTheme();
  const { showToast } = useToast();
  const todayIso = useTodayIso();
  const [upsert] = useUpsertInsuranceBenchmarkMutation();
  const { isBusy, failure, clearFailure, submit } = useFormSubmit();
  const [initial] = useState(() => benchmarkToFormValues(existing, todayIso));
  const [values, setValues] = useState<InsuranceBenchmarkFormValues>(initial);
  const [showError, setShowError] = useState(false);
  const payload = benchmarkFormPayload(values);
  const isDirty = JSON.stringify(values) !== JSON.stringify(initial);

  function change(next: Partial<InsuranceBenchmarkFormValues>): void {
    clearFailure();
    setValues((current) => ({ ...current, ...next }));
  }

  function close(): void {
    if (isBusy) return;
    if (!isDirty) return onClose();
    Alert.alert(MARKET_MESSAGES.discardTitle, MARKET_MESSAGES.discardBody, [
      { text: MARKET_MESSAGES.keepEditing, style: "cancel" },
      { text: MARKET_MESSAGES.discard, style: "destructive", onPress: onClose },
    ]);
  }

  async function save(): Promise<void> {
    if (!payload) {
      setShowError(true);
      return;
    }
    if (await submit(() => upsert(payload).unwrap(), marketSaveFailure)) {
      showToast(MARKET_MESSAGES.saved);
      onClose();
    }
  }

  return (
    <Modal animationType="slide" onRequestClose={close} presentationStyle="pageSheet" visible>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <ScrollView automaticallyAdjustKeyboardInsets contentContainerStyle={{ gap: spacing.md, padding: spacing.lg }} keyboardShouldPersistTaps="handled">
          <Text accessibilityRole="header" style={{ fontSize: fontSize.lg, fontWeight: "600", color: colors.foreground }}>
            {existing ? MARKET_MESSAGES.update : MARKET_MESSAGES.record}
          </Text>
          {failure ? <Banner message={failure} /> : null}
          {showError && !payload ? <Banner message={MARKET_MESSAGES.amountsRequired} /> : null}
          <FormField keyboardType="decimal-pad" label={MARKET_MESSAGES.premium} onChangeText={(premium) => change({ premium })} required value={values.premium} />
          <FormField hint={MARKET_MESSAGES.coverageHint} keyboardType="decimal-pad" label={MARKET_MESSAGES.coverage} onChangeText={(coverage) => change({ coverage })} required value={values.coverage} />
          <FormField label={MARKET_MESSAGES.region} onChangeText={(regionLabel) => change({ regionLabel })} placeholder={MARKET_MESSAGES.regionPlaceholder} value={values.regionLabel} />
          <FormField label={MARKET_MESSAGES.source} onChangeText={(source) => change({ source })} placeholder={MARKET_MESSAGES.sourcePlaceholder} value={values.source} />
          <OptionalDateField label={MARKET_MESSAGES.observedOn} maximumDate={new Date()} onChange={(iso) => change({ observedOn: iso ?? todayIso })} required startsAt={dateFromIso(values.observedOn)} value={values.observedOn} />
          <FormField label={MARKET_MESSAGES.notes} multiline onChangeText={(notes) => change({ notes })} value={values.notes} />
          <LoadingButton disabled={isBusy} isLoading={isBusy} loadingText={MARKET_MESSAGES.saving} onPress={() => void save()}>
            {MARKET_MESSAGES.save}
          </LoadingButton>
          <LoadingButton disabled={isBusy} onPress={close} variant="ghost">
            {MARKET_MESSAGES.cancel}
          </LoadingButton>
        </ScrollView>
      </View>
    </Modal>
  );
}
