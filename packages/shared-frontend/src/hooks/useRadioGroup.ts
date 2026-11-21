import { useRef } from "react";
import type { KeyboardEvent } from "react";
import type { RadioItemProps } from "../types/RadioItemProps";
import { nextTabIndex } from "../utils/tabKeyboard";
import { TAB_KEYS } from "../constants/tab-keys";

const VERTICAL_ARROW_AS_TAB_KEY: Readonly<Record<string, string>> = {
  ArrowDown: TAB_KEYS.next,
  ArrowUp: TAB_KEYS.previous,
};

/**
 * WAI-ARIA radio group behaviour for a set of single-choice buttons: the chosen option (or the
 * first, when none is chosen) is the group's only tab stop, and the arrow keys, Home and End
 * move focus and the selection together. Spread `getRadioProps(value)` onto each option's
 * button and put `role="radiogroup"` plus an accessible name on the container.
 */
export function useRadioGroup(
  values: readonly string[],
  selected: string | null,
  onSelect: (value: string) => void,
) {
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const selectedIndex = selected === null ? -1 : values.indexOf(selected);
  const tabStopIndex = selectedIndex === -1 ? 0 : selectedIndex;

  function getRadioProps(value: string): RadioItemProps {
    const index = values.indexOf(value);
    return {
      ref: (el) => {
        itemRefs.current[index] = el;
      },
      role: "radio",
      "aria-checked": value === selected,
      tabIndex: index === tabStopIndex ? 0 : -1,
      onClick: () => onSelect(value),
      onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => {
        const key = VERTICAL_ARROW_AS_TAB_KEY[event.key] ?? event.key;
        const target = nextTabIndex(key, index, values.length);
        if (target === null) return;
        event.preventDefault();
        itemRefs.current[target]?.focus();
        onSelect(values[target]);
      },
    };
  }

  return { getRadioProps };
}
