import { StyleSheet } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";

/** The scroll content's style with its bottom padding raised by the inset, so the last control clears the nav bar. */
export function withBottomInset(style: StyleProp<ViewStyle>, inset: number): StyleProp<ViewStyle> {
  if (!(inset > 0)) return style;
  const { paddingBottom, paddingVertical, padding } = StyleSheet.flatten(style) ?? {};
  const current = [paddingBottom, paddingVertical, padding].find((value): value is number => typeof value === "number") ?? 0;
  return [style, { paddingBottom: current + inset }];
}
