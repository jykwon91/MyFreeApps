import { useState } from "react";
import { Text } from "react-native";
import { requestTwoStepSetup } from "../auth/twoStepApi";
import { TWO_STEP_MESSAGES as MESSAGES } from "../constants/twoStep";
import { useFieldChain } from "../hooks/useFieldChain";
import { usePendingPress } from "../hooks/usePendingPress";
import { useTheme } from "../theme/useTheme";
import type { TwoStepPasswordStepProps } from "../types/TwoStepPasswordStepProps";
import Banner from "./Banner";
import FormField from "./FormField";
import LoadingButton from "./LoadingButton";

export default function TwoStepPasswordStep({ appName, notice, onStarted, onAlreadyOn }: TwoStepPasswordStepProps) {
  const { colors, fontSize } = useTheme();
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | undefined>();
  const [failure, setFailure] = useState<string | null>(notice);
  // One guard for Return and Continue, so neither can start a second setup while one is asked for.
  const send = usePendingPress(submit, password.length === 0);
  const fields = useFieldChain(["password"], { onLast: send.press, isLastBlocked: send.isPending || password.length === 0 });

  async function submit(): Promise<void> {
    setPasswordError(undefined);
    setFailure(null);
    const result = await requestTwoStepSetup(password);
    setPassword("");
    switch (result.outcome) {
      case "started":
        onStarted(result.setup);
        return;
      case "already_on":
        onAlreadyOn();
        return;
      case "wrong_password":
        setPasswordError(MESSAGES.wrongPassword);
        fields.focus("password");
        return;
      case "rate_limited":
        setFailure(MESSAGES.tooManyTries);
        return;
      case "failed":
        setFailure(`${MESSAGES.startFailed} ${MESSAGES.deleteOlderEntry(appName)}`);
        return;
    }
  }

  return (
    <>
      <Text accessibilityRole="header" style={{ color: colors.foreground, fontSize: fontSize.lg, fontWeight: "600" }}>
        {MESSAGES.passwordHeading}
      </Text>
      <Text style={{ color: colors.foreground, fontSize: fontSize.sm }}>{MESSAGES.passwordBody}</Text>
      {failure ? <Banner message={failure} /> : null}
      <FormField
        {...fields.field("password")}
        autoCapitalize="none"
        autoComplete="current-password"
        autoCorrect={false}
        autoFocus
        error={passwordError}
        label={MESSAGES.password}
        onChangeText={setPassword}
        secureTextEntry
        textContentType="password"
        value={password}
      />
      <LoadingButton disabled={password.length === 0} isLoading={send.isPending} loadingText={MESSAGES.gettingReady} onPress={send.press}>
        {MESSAGES.continue}
      </LoadingButton>
    </>
  );
}
