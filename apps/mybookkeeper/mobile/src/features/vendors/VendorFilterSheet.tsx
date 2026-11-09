import { VENDOR_CATEGORIES, VENDOR_CATEGORY_LABELS } from "@mybookkeeper/api-client/constants/vendorLabels";
import type { VendorCategory } from "@mybookkeeper/api-client/types/vendor/vendor-category";
import { FormSheet, LoadingButton, OptionRow, SwitchRow } from "@platform/mobile";
import { VENDOR_FILTER_MESSAGES as MESSAGES } from "../../constants/vendors";

interface VendorFilterSheetProps {
  isOpen: boolean;
  category: VendorCategory | null;
  preferredOnly: boolean;
  onCategoryChange: (category: VendorCategory | null) => void;
  onPreferredChange: (preferredOnly: boolean) => void;
  onClose: () => void;
}

/** Every way to narrow the vendor list, in one place. Each choice applies as soon as it's made. */
export default function VendorFilterSheet({ isOpen, category, preferredOnly, onCategoryChange, onPreferredChange, onClose }: VendorFilterSheetProps) {
  const isNarrowed = category !== null || preferredOnly;
  return (
    <FormSheet isOpen={isOpen} onRequestClose={onClose} title={MESSAGES.title}>
      <SwitchRow label={MESSAGES.preferredOnly} note={MESSAGES.preferredNote} onValueChange={onPreferredChange} value={preferredOnly} />
      <OptionRow isSelected={category === null} label={MESSAGES.allCategories} onPress={() => onCategoryChange(null)} />
      {VENDOR_CATEGORIES.map((option) => (
        <OptionRow isSelected={category === option} key={option} label={VENDOR_CATEGORY_LABELS[option]} onPress={() => onCategoryChange(option)} />
      ))}
      <LoadingButton onPress={onClose}>{MESSAGES.done}</LoadingButton>
      {isNarrowed ? (
        <LoadingButton
          onPress={() => {
            onCategoryChange(null);
            onPreferredChange(false);
          }}
          variant="ghost"
        >
          {MESSAGES.clear}
        </LoadingButton>
      ) : null}
    </FormSheet>
  );
}
