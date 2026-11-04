import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { signInFailureMessage } from "../auth/signInFailureMessage";
import { MIN_TOUCH_TARGET } from "../theme/touchTarget";
import { useTheme } from "../theme/useTheme";
import type { SignInFailure } from "../types/SignInFailure";
import type { SignInResult } from "../types/SignInResult";
import Banner from "./Banner";
import FormField from "./FormField";
import LoadingButton from "./LoadingButton";

const AUTHENTICATOR_CODE_LENGTH = 6;
const RECOVERY_CODE_LENGTH = 8;

interface SecondFactorFormProps {
  appName: string;
  onSubmit: (code: string) => Promise<SignInResult>;
  /** The email and password stopped working, so this step can't succeed. */
  onCredentialsRejected: (failure: SignInFailure) => void;
  onBack: () => void;
}

export default function SecondFactorForm({ appName, onSubmit, onCredentialsRejected, onBack }: SecondFactorFormProps) {
  const { colors, spacing, fontSize } = useTheme();
  const [code, setCode] = useState("");
  const [useRecoveryCode, setUseRecoveryCode] = useState(false);
  const [failure, setFailure] = useState<SignInFailure | null>(null);
  const requiredLength = useRecoveryCode ? RECOVERY_CODE_LENGTH : AUTHENTICATOR_CODE_LENGTH;

  function handleChange(text: string): void {
    // Pasted codes often arrive as "123 456".
    const cleaned = useRecoveryCode ? text.replace(/[^0-9a-zA-Z]/g, "").toUpperCase() : text.replace(/\D/g, "");
    setCode(cleaned.slice(0, requiredLength));
  }

  async function submit(): Promise<void> {
    setFailure(null);
    const result = await onSubmit(code);
    if (result.outcome !== "failed") return;
    if (result.failure === "bad_credentials" || result.failure === "not_verified") {
      onCredentialsRejected(result.failure);
      return;
    }
    setCode("");
    setFailure(result.failure);
  }

  const codeError = failure === "invalid_totp" ? signInFailureMessage(failure, appName) : undefined;

  return (
    <View style={{ gap: spacing.md }}>
      <Text accessibilityRole="header" style={{ color: colors.foreground, fontSize: fontSize.xl, fontWeight: "700" }}>
        Enter your code
      </Text>
      <Text style={{ color: colors.mutedForeground, fontSize: fontSize.sm }}>
        Open your authenticator app and enter the 6-digit code for {appName}. You can also use a recovery code.
      </Text>
      <FormField
        autoCapitalize={useRecoveryCode ? "characters" : "none"}
        autoComplete={useRecoveryCode ? "off" : "one-time-code"}
        autoCorrect={false}
        autoFocus
        error={codeError}
        keyboardType={useRecoveryCode ? "default" : "number-pad"}
        label={useRecoveryCode ? "Recovery code" : "Authentication code"}
        onChangeText={handleChange}
        textContentType={useRecoveryCode ? "none" : "oneTimeCode"}
        value={code}
      />
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          setCode("");
          setFailure(null);
          setUseRecoveryCode((current) => !current);
        }}
        style={{ minHeight: MIN_TOUCH_TARGET, justifyContent: "center" }}
      >
        <Text style={{ color: colors.primary, fontSize: fontSize.sm, textDecorationLine: "underline" }}>
          {useRecoveryCode ? "Use authenticator code instead" : "Use a recovery code instead"}
        </Text>
      </Pressable>
      {failure && failure !== "invalid_totp" ? <Banner message={signInFailureMessage(failure, appName)} /> : null}
      {/* Failed codes count towards a lockout, so a code is never sent without a press. */}
      <LoadingButton disabled={code.length < requiredLength} loadingText="Verifying..." onPress={submit}>
        Verify
      </LoadingButton>
      <LoadingButton onPress={onBack} variant="ghost">
        Back
      </LoadingButton>
    </View>
  );
}
