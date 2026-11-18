import { useRef } from "react";
import IndeterminateCheckbox from "@/shared/components/ui/IndeterminateCheckbox";

export interface TransactionRowCheckboxProps {
  checked: boolean;
  label: string;
  onToggle: (extendRange: boolean) => void;
}

/** The whole cell is the target, so a click near the box ticks the row instead of opening it. */
export default function TransactionRowCheckbox({ checked, label, onToggle }: TransactionRowCheckboxProps) {
  // The click the label forwards to the box doesn't carry the shift key, so it's read on the way in.
  const shiftHeld = useRef(false);

  return (
    <label
      className="flex min-h-[44px] w-full cursor-pointer select-none items-center px-4 py-2"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        shiftHeld.current = e.shiftKey;
      }}
      onMouseDown={(e) => {
        shiftHeld.current = e.shiftKey;
        // Shift-click would otherwise highlight the text between the two rows.
        if (e.shiftKey) e.preventDefault();
      }}
    >
      <IndeterminateCheckbox
        aria-label={label}
        checked={checked}
        className="h-5 w-5 cursor-pointer"
        onChange={() => onToggle(shiftHeld.current)}
      />
    </label>
  );
}
