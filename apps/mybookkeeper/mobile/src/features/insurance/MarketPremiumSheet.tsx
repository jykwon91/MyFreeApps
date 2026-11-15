import { useUpsertInsuranceBenchmarkMutation } from "@mybookkeeper/api-client/store/insuranceBenchmarksApi";
import type { InsuranceBenchmark } from "@mybookkeeper/api-client/types/insurance/insurance-benchmark";
import type { InsuranceBenchmarkFormValues } from "@mybookkeeper/api-client/types/insurance/insurance-benchmark-form-values";
import { BENCHMARK_NOTES_MAX_LENGTH, BENCHMARK_SOURCE_MAX_LENGTH, INSURANCE_BENCHMARK_REGION_MAX_LENGTH } from "@mybookkeeper/api-client/constants/benchmarkForm";
import { benchmarkFormPayload, benchmarkFormProblems, benchmarkToFormValues } from "@mybookkeeper/api-client/utils/insuranceBenchmarkForm";
import { Banner, FormField, KeyboardAwareScroll, LoadingButton, useTheme, useToast } from "@platform/mobile";
import { useState } from "react";
import { Alert, Modal, Text, View } from "react-native";
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
  const payload = benchmarkFormPayload(values, todayIso);
  const problems = showError ? benchmarkFormProblems(values, todayIso) : {};
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
        <KeyboardAwareScroll contentContainerStyle={{ gap: spacing.md, padding: spacing.lg }} keyboardShouldPersistTaps="handled">
          <Text accessibilityRole="header" style={{ fontSize: fontSize.lg, fontWeight: "600", color: colors.foreground }}>
            {existing ? MARKET_MESSAGES.update : MARKET_MESSAGES.record}
          </Text>
          {failure ? <Banner message={failure} /> : null}
          <FormField error={problems.premium} keyboardType="decimal-pad" label={MARKET_MESSAGES.premium} onChangeText={(premium) => change({ premium })} required value={values.premium} />
          <FormField error={problems.coverage} hint={MARKET_MESSAGES.coverageHint} keyboardType="decimal-pad" label={MARKET_MESSAGES.coverage} onChangeText={(coverage) => change({ coverage })} required value={values.coverage} />
          <FormField error={problems.regionLabel} label={MARKET_MESSAGES.region} maxLength={INSURANCE_BENCHMARK_REGION_MAX_LENGTH} onChangeText={(regionLabel) => change({ regionLabel })} placeholder={MARKET_MESSAGES.regionPlaceholder} value={values.regionLabel} />
          <FormField error={problems.source} label={MARKET_MESSAGES.source} maxLength={BENCHMARK_SOURCE_MAX_LENGTH} onChangeText={(source) => change({ source })} placeholder={MARKET_MESSAGES.sourcePlaceholder} value={values.source} />
          <OptionalDateField error={problems.observedOn} label={MARKET_MESSAGES.observedOn} maximumDate={new Date()} onChange={(iso) => change({ observedOn: iso ?? todayIso })} required startsAt={dateFromIso(values.observedOn)} value={values.observedOn} />
          <FormField error={problems.notes} label={MARKET_MESSAGES.notes} maxLength={BENCHMARK_NOTES_MAX_LENGTH} multiline onChangeText={(notes) => change({ notes })} value={values.notes} />
          <LoadingButton disabled={isBusy} isLoading={isBusy} loadingText={MARKET_MESSAGES.saving} onPress={() => void save()}>
            {MARKET_MESSAGES.save}
          </LoadingButton>
          <LoadingButton disabled={isBusy} onPress={close} variant="ghost">
            {MARKET_MESSAGES.cancel}
          </LoadingButton>
        </KeyboardAwareScroll>
      </View>
    </Modal>
  );
}
