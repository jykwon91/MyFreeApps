import { View } from "react-native";
import ClampedText from "./ClampedText";
import { useLargeText } from "../hooks/useLargeText";
import { useTheme } from "../theme/useTheme";
import type { ListRowTitleProps } from "../types/ListRowTitleProps";

/**
 * A list row's name with what sits beside it, such as an amount. At a normal text size they share one line and the
 * name is cut short; at a large one the name gets its own lines and the rest wraps below it, so nothing is lost.
 */
export default function ListRowTitle({
  title,
  aside,
  leading,
  numberOfLines = 1,
  largeTextNumberOfLines,
  ellipsizeMode,
  weight = "semibold",
  align = "start",
}: ListRowTitleProps) {
  const { colors, spacing, fontSize } = useTheme();
  const isLargeText = useLargeText();
  const isTitleInRow = !isLargeText || Boolean(leading);
  const titleText = (
    <ClampedText
      ellipsizeMode={ellipsizeMode}
      largeTextNumberOfLines={largeTextNumberOfLines}
      numberOfLines={numberOfLines}
      style={{ flex: isTitleInRow ? 1 : undefined, fontSize: fontSize.md, fontWeight: weight === "semibold" ? "600" : "normal", color: colors.foreground }}
    >
      {title}
    </ClampedText>
  );
  const asideRow = aside ? (
    <View style={{ flexDirection: "row", flexWrap: isLargeText ? "wrap" : "nowrap", alignItems: "center", gap: spacing.sm }} testID="list-row-title-aside">
      {aside}
    </View>
  ) : null;

  if (!isLargeText) {
    return (
      <View style={{ flexDirection: "row", alignItems: align === "center" ? "center" : "flex-start", gap: spacing.sm }} testID="list-row-title">
        {leading}
        {titleText}
        {asideRow}
      </View>
    );
  }
  return (
    <View style={{ gap: spacing.xs }} testID="list-row-title">
      {leading ? (
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: spacing.sm }}>
          {leading}
          {titleText}
        </View>
      ) : (
        titleText
      )}
      {asideRow}
    </View>
  );
}
