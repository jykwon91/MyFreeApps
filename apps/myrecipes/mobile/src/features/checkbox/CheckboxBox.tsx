import { useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { CHECKBOX_DISABLED_OPACITY, CHECKBOX_GLYPH, CHECKBOX_GLYPH_MAX_SCALE } from "../../constants/checkbox";
import type { CheckboxBoxProps } from "../../types/CheckboxBoxProps";

/** The decorative box of a checkbox row. The row it sits in carries the checked state, so this is hidden from screen readers. */
export default function CheckboxBox({ isChecked, variant, size, isDisabled = false }: CheckboxBoxProps) {
  const { colors, radius, fontSize } = useTheme();
  const isFilled = variant === "filled";
  const checkedColor = isFilled ? colors.primary : colors.foreground;

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: size,
        height: size,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 2,
        borderRadius: radius.sm,
        borderColor: isChecked ? checkedColor : colors.mutedForeground,
        backgroundColor: isFilled && isChecked ? colors.primary : "transparent",
        opacity: isDisabled ? CHECKBOX_DISABLED_OPACITY : 1,
      }}
    >
      {isChecked ? (
        <Text
          maxFontSizeMultiplier={CHECKBOX_GLYPH_MAX_SCALE}
          style={{
            color: isFilled ? colors.primaryForeground : colors.foreground,
            fontSize: isFilled ? fontSize.sm : fontSize.md,
            fontWeight: "700",
          }}
        >
          {CHECKBOX_GLYPH}
        </Text>
      ) : null}
    </View>
  );
}
