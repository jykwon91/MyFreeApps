import { Text } from "react-native";
import { useLargeText } from "../hooks/useLargeText";
import type { ClampedTextProps } from "../types/ClampedTextProps";

/**
 * Text held to a few lines at a normal text size, that lifts the limit at a large one so nothing is cut short with "…".
 * Use it in place of a `Text` with `numberOfLines`.
 */
export default function ClampedText({ numberOfLines, largeTextNumberOfLines, ...props }: ClampedTextProps) {
  const isLargeText = useLargeText();
  return <Text {...props} numberOfLines={isLargeText ? largeTextNumberOfLines : numberOfLines} />;
}
