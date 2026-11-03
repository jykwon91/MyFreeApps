import { Keyboard, Pressable, Text, TextInput, View } from "react-native";
import { MIN_TOUCH_TARGET } from "../theme/touchTarget";
import { useTheme } from "../theme/useTheme";
import type { SearchFieldProps } from "../types/SearchFieldProps";

export default function SearchField({
  value,
  onChangeText,
  onClear,
  placeholder,
  accessibilityLabel,
}: SearchFieldProps) {
  const { colors, spacing, radius, fontSize } = useTheme();

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        borderWidth: 1,
        borderRadius: radius.md,
        borderColor: colors.input,
        backgroundColor: colors.card,
      }}
    >
      <TextInput
        accessibilityLabel={accessibilityLabel}
        autoCapitalize="none"
        autoCorrect={false}
        onChangeText={onChangeText}
        onSubmitEditing={Keyboard.dismiss}
        placeholder={placeholder}
        placeholderTextColor={colors.mutedForeground}
        returnKeyType="search"
        style={{
          flex: 1,
          minHeight: MIN_TOUCH_TARGET,
          paddingHorizontal: spacing.md,
          color: colors.foreground,
          fontSize: fontSize.md,
        }}
        value={value}
      />
      {value ? (
        <Pressable
          accessibilityLabel="Clear search"
          accessibilityRole="button"
          onPress={onClear}
          style={{
            minWidth: MIN_TOUCH_TARGET,
            minHeight: MIN_TOUCH_TARGET,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ color: colors.mutedForeground, fontSize: fontSize.md }}>✕</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
