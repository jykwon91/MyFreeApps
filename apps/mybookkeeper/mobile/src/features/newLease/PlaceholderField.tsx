import { FormField, useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { PLACEHOLDER_KEYBOARDS } from "../../constants/newLease";
import OptionalDateField from "../shell/OptionalDateField";

interface PlaceholderFieldProps {
  label: string;
  inputType: string;
  required: boolean;
  value: string;
  caption: string | null;
  error?: string;
  isDisabled: boolean;
  onChange: (value: string) => void;
}

export default function PlaceholderField({ label, inputType: type, required, value, caption, error, isDisabled, onChange }: PlaceholderFieldProps) {
  const { colors, spacing, fontSize } = useTheme();
  return (
    <View pointerEvents={isDisabled ? "none" : "auto"} style={{ gap: spacing.xs }}>
      {type === "date" ? (
        <OptionalDateField
          error={error}
          label={label}
          onChange={(iso) => onChange(iso ?? "")}
          required={required}
          startsAt={new Date()}
          value={value || null}
        />
      ) : (
        <FormField
          autoCapitalize={type === "email" ? "none" : undefined}
          autoCorrect={type === "email" ? false : undefined}
          editable={!isDisabled}
          error={error}
          keyboardType={PLACEHOLDER_KEYBOARDS[type]}
          label={label}
          onChangeText={onChange}
          required={required}
          value={value}
        />
      )}
      {caption ? <Text style={{ fontSize: fontSize.xs, color: colors.mutedForeground }}>{caption}</Text> : null}
    </View>
  );
}
