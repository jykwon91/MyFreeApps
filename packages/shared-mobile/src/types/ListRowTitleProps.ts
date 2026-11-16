import type { ReactNode } from "react";
import type { TextProps } from "react-native";

export interface ListRowTitleProps {
  /** The row's name. Held to `numberOfLines` at a normal text size, and shown whole at a large one. */
  title: string;
  /** Shown at the end of the title's line, such as an amount, a date or chips. At a large text size it moves below the title and wraps. */
  aside?: ReactNode;
  /** Shown before the title, such as a tick box while picking several. */
  leading?: ReactNode;
  /** Lines the title may use at a normal text size. Defaults to 1. */
  numberOfLines?: number;
  /** Lines the title may use at a large text size. Leave out to show it whole. */
  largeTextNumberOfLines?: number;
  ellipsizeMode?: TextProps["ellipsizeMode"];
  /** Defaults to semibold. */
  weight?: "regular" | "semibold";
  /** How the parts line up across the line at a normal text size. Defaults to the top. */
  align?: "start" | "center";
}
