import { UTILITY_SERVICE_TYPES, UTILITY_SERVICE_TYPE_LABELS } from "@mybookkeeper/api-client/constants/utilityServiceTypes";
import { FormSheet, LoadingButton, OptionRow, SwitchRow } from "@platform/mobile";
import { UTILITY_PLAN_MESSAGES as MESSAGES } from "../../constants/utilityPlans";
import type { UtilityPlanFilter } from "../../types/UtilityPlanFilter";
import { NO_UTILITY_PLAN_FILTER, isNarrowed } from "./utilityPlanFilter";

interface UtilityPlanFilterSheetProps {
  isOpen: boolean;
  filter: UtilityPlanFilter;
  onChange: (filter: UtilityPlanFilter) => void;
  onClose: () => void;
}

/** Every way to narrow the plan list, in one place. Each choice applies as soon as it's made. */
export default function UtilityPlanFilterSheet({ isOpen, filter, onChange, onClose }: UtilityPlanFilterSheetProps) {
  return (
    <FormSheet isOpen={isOpen} onRequestClose={onClose} title={MESSAGES.filterTitle}>
      <SwitchRow label={MESSAGES.needsRenewing} note={MESSAGES.needsRenewingNote} onValueChange={(needsRenewing) => onChange({ ...filter, needsRenewing })} value={filter.needsRenewing} />
      <OptionRow isSelected={filter.serviceType === null} label={MESSAGES.allServices} onPress={() => onChange({ ...filter, serviceType: null })} />
      {UTILITY_SERVICE_TYPES.map((service) => (
        <OptionRow isSelected={filter.serviceType === service} key={service} label={UTILITY_SERVICE_TYPE_LABELS[service]} onPress={() => onChange({ ...filter, serviceType: service })} />
      ))}
      <LoadingButton onPress={onClose}>{MESSAGES.filterDone}</LoadingButton>
      {isNarrowed(filter) ? (
        <LoadingButton onPress={() => onChange(NO_UTILITY_PLAN_FILTER)} variant="ghost">
          {MESSAGES.filterClear}
        </LoadingButton>
      ) : null}
    </FormSheet>
  );
}
