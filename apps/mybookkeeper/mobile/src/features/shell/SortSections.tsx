import { OptionRow } from "@platform/mobile";
import { SORT_DIRECTIONS, SORT_SHEET } from "../../constants/sortSheet";
import type { SortSectionsProps } from "../../types/SortSectionsProps";
import FilterSheetSection from "./FilterSheetSection";

/** The "Sort by" and "Order" choices of a filter sheet. */
export default function SortSections<Field extends string>({ fields, field, direction, onFieldChange, onDirectionChange }: SortSectionsProps<Field>) {
  return (
    <>
      <FilterSheetSection title={SORT_SHEET.sortBy}>
        {fields.map((option) => (
          <OptionRow isSelected={field === option.value} key={option.value} label={option.label} onPress={() => onFieldChange(option.value)} />
        ))}
      </FilterSheetSection>
      <FilterSheetSection title={SORT_SHEET.order}>
        {SORT_DIRECTIONS.map((option) => (
          <OptionRow isSelected={direction === option.value} key={option.value} label={option.label} onPress={() => onDirectionChange(option.value)} />
        ))}
      </FilterSheetSection>
    </>
  );
}
