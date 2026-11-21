import type { ReactNode } from "react";
import type { KeyboardAwareScrollProps } from "./KeyboardAwareScrollProps";

export type ScrollWithPinnedBarProps = Omit<KeyboardAwareScrollProps, "padForNavigationBar"> & {
  /** The bar drawn under the scroll view, a PinnedBar. */
  bar: ReactNode;
};
