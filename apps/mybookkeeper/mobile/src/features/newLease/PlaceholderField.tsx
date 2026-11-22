import { type FieldChainProps, FormField, useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { PLACEHOLDER_PRESETS } from "../../constants/newLease";
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
  /** Where Return goes from a typed field; a date field has no keyboard. */
  chain: FieldChainProps;
}

export default function PlaceholderField({ label, inputType: type, required, value, caption, error, isDisabled, onChange, chain }: PlaceholderFieldProps) {
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
          {...PLACEHOLDER_PRESETS[type]}
          {...chain}
          editable={!isDisabled}
          error={error}
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
