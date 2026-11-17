import type { TextProps } from "react-native";

export interface ClampedTextProps extends Omit<TextProps, "numberOfLines"> {
  /** Lines the text may use at a normal text size. */
  numberOfLines: number;
  /** Lines it may use at a large text size. Leave out to show it whole, which is right for anything a person needs to read. */
  largeTextNumberOfLines?: number;
}
