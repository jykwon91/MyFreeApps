import { Text } from "react-native";
import { useFieldErrorAnnouncement } from "../hooks/useFieldErrorAnnouncement";
import { useTheme } from "../theme/useTheme";
import type { FieldErrorProps } from "../types/FieldErrorProps";

/**
 * What's wrong with a field, said the way FormField says it. The screen reader reads it once, politely,
 * together with any other field's problem from the same save; put the same message in the control's
 * accessibilityHint. The visible copy is plain text, not an alert, so it never talks over that summary.
 */
export default function FieldError({ name, message, size = "sm" }: FieldErrorProps) {
  const { colors, fontSize } = useTheme();
  useFieldErrorAnnouncement(name, message);
  if (!message) return null;
  return <Text style={{ color: colors.destructiveText, fontSize: fontSize[size] }}>{message}</Text>;
}
