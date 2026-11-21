import { Text } from "react-native";
import { useTheme } from "../theme/useTheme";
import type { FieldLabelProps } from "../types/FieldLabelProps";

/**
 * The visible label above a field, with a red asterisk when it's required. Screen readers skip it, so
 * the asterisk is never read as "star"; the control carries the label and "required" in its own
 * accessibilityLabel (see requiredFieldLabel).
 */
export default function FieldLabel({ label, required = false, size = "xs" }: FieldLabelProps) {
  const { colors, fontSize } = useTheme();
  return (
    <Text
      importantForAccessibility="no"
      accessibilityElementsHidden
      style={{ color: colors.foreground, fontSize: fontSize[size], fontWeight: "500" }}
    >
      {label}
      {required ? <Text style={{ color: colors.destructiveText }}> *</Text> : null}
    </Text>
  );
}
