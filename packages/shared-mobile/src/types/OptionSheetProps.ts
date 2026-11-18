import type { ReactNode } from "react";
import type { SectionErrorProps } from "./SectionErrorProps";
import type { SheetOption } from "./SheetOption";

export interface OptionSheetProps<Value extends string> {
  isOpen: boolean;
  title: string;
  /** Says why the choice is being asked for. */
  description?: string;
  options: readonly SheetOption<Value>[];
  value: Value | null;
  onSelect: (value: Value) => void;
  onClose: () => void;
  /** Shown when there is nothing to choose from. */
  emptyText?: string;
  /** Shown instead of `emptyText` when the list is empty for another reason, like still loading or failing to load. */
  emptyContent?: ReactNode;
  /** The options couldn't load: says so in place of the list, with a way to try again. */
  loadError?: SectionErrorProps;
  /** The person scrolled near the end of the options: ask for the next page, when they come a page at a time. */
  onEndReached?: () => void;
  /** Under the options, such as the next page loading or failing to load. */
  footer?: ReactNode;
  /** After it has finished closing. An Alert raised before then can be lost on iOS. */
  onClosed?: () => void;
}
