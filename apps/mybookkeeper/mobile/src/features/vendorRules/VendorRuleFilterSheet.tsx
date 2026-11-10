import type { ClassificationRuleGroup } from "@mybookkeeper/api-client/types/classification-rule/classification-rule-group";
import { FormSheet, LoadingButton, OptionRow } from "@platform/mobile";
import { VENDOR_RULE_FILTER_MESSAGES as MESSAGES } from "../../constants/vendorRules";

interface VendorRuleFilterSheetProps {
  isOpen: boolean;
  /** The types that have rules, so every choice shown leads somewhere. */
  /** How many rules there are in all, shown beside "All types". */
  total: number;
  groups: readonly ClassificationRuleGroup[];
  matchType: string | null;
  onMatchTypeChange: (matchType: string | null) => void;
  onClose: () => void;
}

/** Narrow the rules to one match type. The choice applies as soon as it's made. */
export default function VendorRuleFilterSheet({ isOpen, total, groups, matchType, onMatchTypeChange, onClose }: VendorRuleFilterSheetProps) {
  return (
    <FormSheet isOpen={isOpen} onRequestClose={onClose} title={MESSAGES.title}>
      <OptionRow isSelected={matchType === null} label={`${MESSAGES.allTypes} (${total})`} onPress={() => onMatchTypeChange(null)} />
      {groups.map((group) => (
        <OptionRow
          isSelected={matchType === group.matchType}
          key={group.matchType}
          label={`${group.label} (${group.rules.length})`}
          onPress={() => onMatchTypeChange(group.matchType)}
        />
      ))}
      <LoadingButton onPress={onClose}>{MESSAGES.done}</LoadingButton>
      {matchType !== null ? (
        <LoadingButton onPress={() => onMatchTypeChange(null)} variant="ghost">
          {MESSAGES.clear}
        </LoadingButton>
      ) : null}
    </FormSheet>
  );
}
