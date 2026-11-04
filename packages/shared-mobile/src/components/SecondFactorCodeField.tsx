import type { ComponentRef, Ref } from "react";
import { Pressable, Text, type TextInput } from "react-native";
import type { useSecondFactorCode } from "../hooks/useSecondFactorCode";
import { MIN_TOUCH_TARGET } from "../theme/touchTarget";
import { useTheme } from "../theme/useTheme";
import FormField from "./FormField";

interface SecondFactorCodeFieldProps {
  secondFactor: ReturnType<typeof useSecondFactorCode>;
  error?: string;
  autoFocus?: boolean;
  onToggle?: () => void;
  ref?: Ref<ComponentRef<typeof TextInput>>;
}

export default function SecondFactorCodeField({ secondFactor, error, autoFocus, onToggle, ref }: SecondFactorCodeFieldProps) {
  const { colors, fontSize } = useTheme();
  const { code, usesRecoveryCode, change, toggleRecoveryCode } = secondFactor;

  return (
    <>
      <FormField
        autoCapitalize={usesRecoveryCode ? "characters" : "none"}
        autoComplete={usesRecoveryCode ? "off" : "one-time-code"}
        autoCorrect={false}
        autoFocus={autoFocus}
        error={error}
        keyboardType={usesRecoveryCode ? "default" : "number-pad"}
        label={usesRecoveryCode ? "Recovery code" : "Authentication code"}
        onChangeText={change}
        ref={ref}
        textContentType={usesRecoveryCode ? "none" : "oneTimeCode"}
        value={code}
      />
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          toggleRecoveryCode();
          onToggle?.();
        }}
        style={{ minHeight: MIN_TOUCH_TARGET, justifyContent: "center" }}
      >
        <Text style={{ color: colors.primary, fontSize: fontSize.sm, textDecorationLine: "underline" }}>
          {usesRecoveryCode ? "Use authenticator code instead" : "Use a recovery code instead"}
        </Text>
      </Pressable>
    </>
  );
}
