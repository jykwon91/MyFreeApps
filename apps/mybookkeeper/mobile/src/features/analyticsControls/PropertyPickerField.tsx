import { useState } from "react";
import { MONEY_ANALYSIS_MESSAGES as MESSAGES } from "../../constants/moneyAnalysis";
import PickerField from "../transactions/PickerField";
import PropertyMultiSheet from "./PropertyMultiSheet";

interface PropertyPickerFieldProps {
  properties: readonly { id: string; name: string }[];
  selectedIds: readonly string[];
  onChange: (ids: string[]) => void;
  /** The most that can be chosen at once, when the numbers behind the screen can't take more. */
  maxSelected?: number;
}

function propertiesValue(properties: readonly { id: string; name: string }[], ids: readonly string[]): string {
  if (ids.length === 0) return MESSAGES.allProperties;
  if (ids.length === 1) return properties.find((property) => property.id === ids[0])?.name ?? MESSAGES.nProperties(1);
  return MESSAGES.nProperties(ids.length);
}

/** The property picker and its sheet. With only one property there is nothing to choose, so it isn't shown. */
export default function PropertyPickerField({ properties, selectedIds, onChange, maxSelected }: PropertyPickerFieldProps) {
  const [isOpen, setIsOpen] = useState(false);
  if (properties.length < 2) return null;
  return (
    <>
      <PickerField hint={MESSAGES.propertiesHint} label={MESSAGES.properties} onPress={() => setIsOpen(true)} value={propertiesValue(properties, selectedIds)} />
      <PropertyMultiSheet isOpen={isOpen} maxSelected={maxSelected} onChange={onChange} onClose={() => setIsOpen(false)} properties={properties} selectedIds={selectedIds} />
    </>
  );
}
