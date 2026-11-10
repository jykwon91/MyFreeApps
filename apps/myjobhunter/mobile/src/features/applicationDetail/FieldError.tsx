import { useTheme } from "@platform/mobile";
import { Text } from "react-native";
import type { FieldErrorProps } from "../../types/FieldErrorProps";

/** What's wrong with a field that isn't a FormField, said the way FormField says it. */
export default function FieldError({ message }: FieldErrorProps) {
  const { colors, fontSize } = useTheme();
  if (!message) return null;
  return (
    <Text accessibilityRole="alert" style={{ fontSize: fontSize.sm, color: colors.destructiveText }}>
      {message}
    </Text>
  );
}
