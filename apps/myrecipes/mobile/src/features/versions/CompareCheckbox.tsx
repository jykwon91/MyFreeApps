import { useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { COMPARE_CHECKBOX_SIZE } from "../../constants/versions";
import type { CompareCheckboxProps } from "../../types/CompareCheckboxProps";

/** The box beside a version while picking two to compare. The row it sits in says whether it's checked. */
export default function CompareCheckbox({ isChecked, isDisabled }: CompareCheckboxProps) {
  const { colors, radius, fontSize } = useTheme();

  return (
    <View
      style={{
        width: COMPARE_CHECKBOX_SIZE,
        height: COMPARE_CHECKBOX_SIZE,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 2,
        borderRadius: radius.sm,
        borderColor: isChecked ? colors.primary : colors.mutedForeground,
        backgroundColor: isChecked ? colors.primary : "transparent",
        opacity: isDisabled ? 0.4 : 1,
      }}
    >
      {isChecked ? (
        <Text style={{ color: colors.primaryForeground, fontSize: fontSize.sm, fontWeight: "700" }}>✓</Text>
      ) : null}
    </View>
  );
}
