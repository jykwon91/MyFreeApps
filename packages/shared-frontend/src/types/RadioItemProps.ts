import type { KeyboardEventHandler, MouseEventHandler, Ref } from "react";

/** Props to spread onto one option of a radio group so it announces and navigates as a radio. */
export interface RadioItemProps {
  ref: Ref<HTMLButtonElement>;
  role: "radio";
  "aria-checked": boolean;
  tabIndex: 0 | -1;
  onClick: MouseEventHandler<HTMLButtonElement>;
  onKeyDown: KeyboardEventHandler<HTMLButtonElement>;
}
