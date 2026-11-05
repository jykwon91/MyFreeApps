import { useState } from "react";
import { Linking, Pressable, Text } from "react-native";
import { TWO_STEP_MESSAGES as MESSAGES } from "../constants/twoStep";
import { useSecondFactorCode } from "../hooks/useSecondFactorCode";
import { MIN_TOUCH_TARGET } from "../theme/touchTarget";
import { useTheme } from "../theme/useTheme";
import type { TwoStepAddStepProps } from "../types/TwoStepAddStepProps";
import Banner from "./Banner";
import FormField from "./FormField";
import LoadingButton from "./LoadingButton";
import TwoStepKeyDetails from "./TwoStepKeyDetails";

export default function TwoStepAddStep({ appName, setup, notice, onSubmit }: TwoStepAddStepProps) {
  const { colors, fontSize } = useTheme();
  const secondFactor = useSecondFactorCode();
  const [isKeyShown, setIsKeyShown] = useState(false);
  const [codeError, setCodeError] = useState<string | undefined>();
  const [failure, setFailure] = useState<string | null>(notice);

  async function openAuthenticator(): Promise<void> {
    setFailure(null);
    try {
      await Linking.openURL(setup.provisioning_uri);
    } catch {
      setFailure(MESSAGES.noAuthenticator);
      setIsKeyShown(true);
    }
  }

  async function submit(): Promise<void> {
    setCodeError(undefined);
    setFailure(null);
    const problem = await onSubmit(secondFactor.code);
    if (!problem) return;
    // Each code works once, so whichever way it failed this one is finished with.
    secondFactor.clear();
    setCodeError(problem.codeError);
    setFailure(problem.failure ?? null);
  }

  return (
    <>
      <Text accessibilityRole="header" style={{ color: colors.foreground, fontSize: fontSize.lg, fontWeight: "600" }}>
        {MESSAGES.addHeading(appName)}
      </Text>
      <Text style={{ color: colors.foreground, fontSize: fontSize.sm }}>{MESSAGES.addBody(appName)}</Text>
      <Text style={{ color: colors.mutedForeground, fontSize: fontSize.sm }}>{MESSAGES.deleteOlderEntry(appName)}</Text>
      {failure ? <Banner message={failure} /> : null}
      <LoadingButton onPress={openAuthenticator} variant="secondary">
        {MESSAGES.openAuthenticator}
      </LoadingButton>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: isKeyShown }}
        onPress={() => setIsKeyShown((shown) => !shown)}
        style={{ minHeight: MIN_TOUCH_TARGET, justifyContent: "center" }}
      >
        <Text style={{ color: colors.primary, fontSize: fontSize.sm, textDecorationLine: "underline" }}>
          {isKeyShown ? MESSAGES.hideKey : MESSAGES.showKey}
        </Text>
      </Pressable>
      {isKeyShown ? <TwoStepKeyDetails setup={setup} /> : null}
      <FormField
        autoComplete="one-time-code"
        error={codeError}
        keyboardType="number-pad"
        label={MESSAGES.codeLabel}
        onChangeText={secondFactor.change}
        textContentType="oneTimeCode"
        value={secondFactor.code}
      />
      <LoadingButton disabled={!secondFactor.isComplete} loadingText={MESSAGES.turningOn} onPress={submit}>
        {MESSAGES.confirmTurnOn}
      </LoadingButton>
    </>
  );
}
