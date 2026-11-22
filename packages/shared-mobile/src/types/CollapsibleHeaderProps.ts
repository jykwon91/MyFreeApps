import type { ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";

export interface CollapsibleHeaderProps {
  /** The section's name. Read as a heading, so it shows in the screen reader's list of headings. */
  title: string;
  /** What the heading reads aloud when that should say more than `title`, such as a count. */
  headingLabel?: string;
  isOpen: boolean;
  onToggle: () => void;
  /** What the open/close control shows, such as "Show" and "Hide", or an arrow. */
  action: ReactNode;
  /** What the open/close control reads aloud. Defaults to `title`. Its open or closed state is read separately. */
  actionLabel?: string;
  actionHint?: string;
  /** Sighted-only extras before the title, such as an arrow. */
  leading?: ReactNode;
  /** Sighted-only extras after the title, such as a count the heading label already carries. */
  aside?: ReactNode;
  /** Sighted-only extras under the title row, such as a preview the open/close label already carries. */
  below?: ReactNode;
  /** The size of the title. Defaults to "md". */
  titleSize?: "md" | "lg";
  style?: StyleProp<ViewStyle>;
}
