import { ChipButton, FormField, MIN_TOUCH_TARGET, useTheme } from "@platform/mobile";
import { Pressable, Text, View } from "react-native";
import { CHIP_FIELD_MESSAGES as MESSAGES, CHIP_FIELD_SEPARATOR } from "../../constants/savedSearchSheet";
import { addChipValues } from "../../lib/addChipValues";
import type { ChipListFieldProps } from "../../types/ChipListFieldProps";

/**
 * The phone's form of the website's chip input: type an entry and tap Add, Return or a comma, or
 * leave the field; tap an entry to remove it, or a suggestion to add it.
 */
export default function ChipListField({ label, values, onChange, draft, onDraftChange, placeholder, hint, suggestions = [], required, disabled = false }: ChipListFieldProps) {
  const { colors, spacing, fontSize } = useTheme();
  const offered = suggestions.filter((suggestion) => !values.some((value) => value.toLowerCase() === suggestion.toLowerCase()));

  function addDraft(text: string): void {
    if (text.trim() === "") return;
    onChange(addChipValues(values, text.split(CHIP_FIELD_SEPARATOR)));
    onDraftChange("");
  }

  function type(text: string): void {
    const end = text.lastIndexOf(CHIP_FIELD_SEPARATOR);
    if (end === -1) {
      onDraftChange(text);
      return;
    }
    // Everything before the last comma is finished; what follows is still being typed.
    onChange(addChipValues(values, text.slice(0, end).split(CHIP_FIELD_SEPARATOR)));
    onDraftChange(text.slice(end + 1));
  }

  return (
    <View style={{ gap: spacing.sm }}>
      <FormField
        editable={!disabled}
        hint={hint}
        label={label}
        onBlur={() => addDraft(draft)}
        onChangeText={type}
        onSubmitEditing={() => addDraft(draft)}
        placeholder={placeholder}
        required={required}
        returnKeyType="done"
        submitBehavior="submit"
        trailing={
          <Pressable
            accessibilityLabel={MESSAGES.addTo(label)}
            accessibilityRole="button"
            accessibilityState={{ disabled: disabled || draft.trim() === "" }}
            disabled={disabled || draft.trim() === ""}
            onPress={() => addDraft(draft)}
            style={({ pressed }) => ({ minHeight: MIN_TOUCH_TARGET, minWidth: MIN_TOUCH_TARGET, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.6 : 1 })}
          >
            <Text style={{ fontSize: fontSize.sm, fontWeight: "600", color: draft.trim() === "" ? colors.mutedForeground : colors.primary }}>{MESSAGES.add}</Text>
          </Pressable>
        }
        value={draft}
      />
      {values.length > 0 ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          {values.map((value) => (
            <ChipButton
              accessibilityLabel={MESSAGES.remove(value)}
              disabled={disabled}
              key={value}
              label={`${value}  ×`}
              onPress={() => onChange(values.filter((kept) => kept !== value))}
            />
          ))}
        </View>
      ) : null}
      {offered.length > 0 ? (
        <View style={{ gap: spacing.xs }}>
          <Text style={{ fontSize: fontSize.xs, color: colors.mutedForeground }}>{MESSAGES.suggestions}</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
            {offered.map((suggestion) => (
              <ChipButton accessibilityLabel={MESSAGES.suggest(suggestion)} disabled={disabled} key={suggestion} label={`+ ${suggestion}`} onPress={() => onChange(addChipValues(values, [suggestion]))} />
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}
