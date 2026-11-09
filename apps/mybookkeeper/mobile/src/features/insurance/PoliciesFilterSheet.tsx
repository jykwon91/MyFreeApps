import { OptionSheet } from "@platform/mobile";
import { INSURANCE_MESSAGES } from "../../constants/insurance";
import type { PolicyFilter } from "../../types/PolicyFilter";

const OPTIONS = [
  { value: "all", label: INSURANCE_MESSAGES.filterAll },
  { value: "expiring", label: INSURANCE_MESSAGES.filterExpiring },
] as const;

interface PoliciesFilterSheetProps {
  isOpen: boolean;
  value: PolicyFilter;
  onSelect: (filter: PolicyFilter) => void;
  onClose: () => void;
}

export default function PoliciesFilterSheet({ isOpen, value, onSelect, onClose }: PoliciesFilterSheetProps) {
  return <OptionSheet isOpen={isOpen} onClose={onClose} onSelect={onSelect} options={OPTIONS} title={INSURANCE_MESSAGES.filterTitle} value={value} />;
}
