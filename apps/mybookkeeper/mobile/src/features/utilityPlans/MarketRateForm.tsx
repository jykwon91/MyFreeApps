import type { MarketRateBenchmark } from "@mybookkeeper/api-client/types/utility/market-rate-benchmark";
import type { MarketRateFormValues } from "@mybookkeeper/api-client/types/utility/market-rate-form-values";
import { UTILITY_SERVICE_TYPE_LABELS } from "@mybookkeeper/api-client/constants/utilityServiceTypes";
import type { UtilityServiceType } from "@mybookkeeper/api-client/types/utility/utility-service-type";
import { BENCHMARK_NOTES_MAX_LENGTH, BENCHMARK_SOURCE_MAX_LENGTH } from "@mybookkeeper/api-client/constants/benchmarkForm";
import { isFlatService, marketRateFormProblems, marketRateToFormValues } from "@mybookkeeper/api-client/utils/marketRateForm";
import { localToday } from "@platform/core/utils/localToday";
import { Banner, FormField, KeyboardAwareScroll, LoadingButton, useDiscardPrompt, useTheme } from "@platform/mobile";
import { useRef, useState } from "react";

import { MARKET_RATE_MESSAGES as MESSAGES } from "../../constants/marketRates";
import { sameFormValues } from "../../lib/sameFormValues";
import { askOnce } from "../../lib/askOnce";
import OptionalDateField from "../shell/OptionalDateField";
import { useSaveMarketRate } from "./useSaveMarketRate";

interface MarketRateFormProps {
  serviceType: UtilityServiceType;
  existing: MarketRateBenchmark | undefined;
}

/** Records one service's going rate, or changes or removes the one on file. */
export default function MarketRateForm({ serviceType, existing }: MarketRateFormProps) {
  const { spacing } = useTheme();
  const [saved] = useState(() => marketRateToFormValues(serviceType, existing));
  const [values, setValues] = useState<MarketRateFormValues>(saved);
  const [hasTried, setHasTried] = useState(false);
  const asking = useRef(false);
  const { save, remove, isSaving, isRemoving, isLeaving, failure } = useSaveMarketRate(serviceType, existing === undefined);
  const isBusy = isSaving || isRemoving;
  const locked = isBusy || isLeaving;
  const flat = isFlatService(serviceType);
  const allProblems = marketRateFormProblems(serviceType, values, localToday());
  const problems = hasTried ? allProblems : {};
  const set = (field: keyof MarketRateFormValues, value: string) => setValues((current) => ({ ...current, [field]: value }));

  useDiscardPrompt(!sameFormValues(values, saved) && !isLeaving, isBusy);

  function submit(): void {
    setHasTried(true);
    if (Object.keys(allProblems).length > 0) return;
    void save(values);
  }

  return (
    <KeyboardAwareScroll contentContainerStyle={{ gap: spacing.lg, padding: spacing.lg }} contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled">
      {failure ? <Banner message={failure} /> : null}
      <FormField
        editable={!locked}
        error={problems.figure}
        hint={flat ? MESSAGES.figureFlatHint : MESSAGES.figureMeteredHint}
        keyboardType="decimal-pad"
        label={flat ? MESSAGES.figureFlat : MESSAGES.figureMetered}
        onChangeText={(text) => set("figure", text)}
        required
        value={values.figure}
      />
      <FormField
        editable={!locked}
        hint={MESSAGES.sourceHint}
        label={MESSAGES.source}
        error={problems.source}
        maxLength={BENCHMARK_SOURCE_MAX_LENGTH}
        onChangeText={(text) => set("source", text)}
        value={values.source}
      />
      <OptionalDateField disabled={locked} error={problems.observedOn} label={MESSAGES.observedOn} maximumDate={new Date()} onChange={(iso) => set("observedOn", iso ?? "")} required startsAt={new Date()} value={values.observedOn || null} />
      <FormField editable={!locked} error={problems.notes} label={MESSAGES.notes} maxLength={BENCHMARK_NOTES_MAX_LENGTH} multiline onChangeText={(text) => set("notes", text)} value={values.notes} />
      <LoadingButton disabled={locked} isLoading={isSaving} loadingText={MESSAGES.saving} onPress={submit}>
        {MESSAGES.save}
      </LoadingButton>
      {existing ? (
        <LoadingButton
          disabled={locked}
          isLoading={isRemoving}
          loadingText={MESSAGES.removing}
          onPress={() =>
            askOnce(asking, MESSAGES.removeTitle(UTILITY_SERVICE_TYPE_LABELS[serviceType]), MESSAGES.removeBody, { text: MESSAGES.confirmRemove, style: "destructive", onPress: () => void remove() })
          }
          variant="destructive"
        >
          {MESSAGES.remove}
        </LoadingButton>
      ) : null}
    </KeyboardAwareScroll>
  );
}
