import type { DocumentFilterOption } from "@mybookkeeper/api-client/types/document/DocumentFilterOption";
import { OptionRow } from "@platform/mobile";

/** Several can be on at once, like the website's column filters. */
export default function ChoiceRows({
  options,
  chosen,
  onChange,
}: {
  options: readonly DocumentFilterOption[];
  chosen: readonly string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <>
      {options.map((option) => (
        <OptionRow
          isSelected={chosen.includes(option.value)}
          key={option.value}
          kind="checkbox"
          label={option.label}
          onPress={() => onChange(chosen.includes(option.value) ? chosen.filter((value) => value !== option.value) : [...chosen, option.value])}
        />
      ))}
    </>
  );
}
