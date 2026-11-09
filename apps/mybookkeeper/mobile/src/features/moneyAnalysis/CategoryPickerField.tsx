import { useState } from "react";
import { MONEY_ANALYSIS_MESSAGES as MESSAGES } from "../../constants/moneyAnalysis";
import PickerField from "../transactions/PickerField";
import { categoriesValue } from "./categoryFilterDisplay";
import CategoryFilterSheet from "./CategoryFilterSheet";

/** The category picker and its sheet. */
export default function CategoryPickerField({ selected, onChange }: { selected: ReadonlySet<string>; onChange: (selected: Set<string>) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <>
      <PickerField hint={MESSAGES.categoriesHint} label={MESSAGES.categories} onPress={() => setIsOpen(true)} value={categoriesValue(selected)} />
      <CategoryFilterSheet isOpen={isOpen} onChange={onChange} onClose={() => setIsOpen(false)} selected={selected} />
    </>
  );
}
