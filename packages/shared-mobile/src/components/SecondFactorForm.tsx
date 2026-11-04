import { useState } from "react";
import { Text, View } from "react-native";
import { signInFailureMessage } from "../auth/signInFailureMessage";
import { useSecondFactorCode } from "../hooks/useSecondFactorCode";
import { useTheme } from "../theme/useTheme";
import type { SignInFailure } from "../types/SignInFailure";
import type { SignInResult } from "../types/SignInResult";
import Banner from "./Banner";
import LoadingButton from "./LoadingButton";
import SecondFactorCodeField from "./SecondFactorCodeField";

interface SecondFactorFormProps {
  appName: string;
  onSubmit: (code: string) => Promise<SignInResult>;
  /** The email and password stopped working, so this step can't succeed. */
  onCredentialsRejected: (failure: SignInFailure) => void;
  onBack: () => void;
}

export default function SecondFactorForm({ appName, onSubmit, onCredentialsRejected, onBack }: SecondFactorFormProps) {
  const { colors, spacing, fontSize } = useTheme();
  const secondFactor = useSecondFactorCode();
  const [failure, setFailure] = useState<SignInFailure | null>(null);

  async function submit(): Promise<void> {
    setFailure(null);
    const result = await onSubmit(secondFactor.code);
    if (result.outcome !== "failed") return;
    if (result.failure === "bad_credentials" || result.failure === "not_verified") {
      onCredentialsRejected(result.failure);
      return;
    }
    secondFactor.clear();
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
      <SecondFactorCodeField
        autoFocus
        error={codeError}
        onToggle={() => setFailure(null)}
        secondFactor={secondFactor}
      />
      {failure && failure !== "invalid_totp" ? <Banner message={signInFailureMessage(failure, appName)} /> : null}
      {/* Failed codes count towards a lockout, so a code is never sent without a press. */}
      <LoadingButton disabled={!secondFactor.isComplete} loadingText="Verifying..." onPress={submit}>
        Verify
      </LoadingButton>
      <LoadingButton onPress={onBack} variant="ghost">
        Back
      </LoadingButton>
    </View>
  );
}
