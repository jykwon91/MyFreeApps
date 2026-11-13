import type { TotpSetup } from "@platform/core/types/security/totp-setup";
import { useState } from "react";
import { Text, View } from "react-native";
import { fetchTwoFactorEnabled } from "../auth/mobileAuthApi";
import { requestTwoStepVerify } from "../auth/twoStepApi";
import { TWO_STEP_MESSAGES as MESSAGES } from "../constants/twoStep";
import { TWO_STEP_TURN_ON_STEP as STEP } from "../constants/twoStepTurnOnStepName";
import { useToast } from "../hooks/useToast";
import { useTheme } from "../theme/useTheme";
import type { TwoStepCodeProblem } from "../types/TwoStepCodeProblem";
import type { TwoStepTurnOffSettled } from "../types/TwoStepTurnOffSettled";
import type { TwoStepTurnOnStep } from "../types/TwoStepTurnOnStep";
import type { TwoStepVerifyResult } from "../types/TwoStepVerifyResult";
import type { TwoStepTurnOnScreenProps } from "../types/TwoStepTurnOnScreenProps";
import Banner from "./Banner";
import KeyboardAwareScroll from "./KeyboardAwareScroll";
import LoadingButton from "./LoadingButton";
import TwoStepAddStep from "./TwoStepAddStep";
import TwoStepPasswordStep from "./TwoStepPasswordStep";
import TwoStepRecoveryCodes from "./TwoStepRecoveryCodes";
import TwoStepTurnOffSheet from "./TwoStepTurnOffSheet";

export default function TwoStepTurnOnScreen({ appName, onFinished, onLeaveRiskChange }: TwoStepTurnOnScreenProps) {
  const { colors, spacing, fontSize } = useTheme();
  const { showToast } = useToast();
  const [step, setStep] = useState<TwoStepTurnOnStep>({ name: STEP.PASSWORD, notice: null });
  const [addAttempt, setAddAttempt] = useState(0);
  const [isTurningOff, setIsTurningOff] = useState(false);

  /** The same code never goes again: it either worked, or it's spent. */
  async function findOutWhatHappened(setup: TotpSetup): Promise<void> {
    try {
      const isOn = await fetchTwoFactorEnabled();
      if (isOn) {
        setStep({ name: STEP.ON_WITHOUT_CODES });
        return;
      }
      // A fresh field every time, however many answers in a row get lost.
      setAddAttempt((attempt) => attempt + 1);
      setStep({ name: STEP.ADD, setup, notice: MESSAGES.notThrough });
    } catch {
      setStep({ name: STEP.UNSURE, setup });
    }
  }

  async function settleCode(setup: TotpSetup, result: TwoStepVerifyResult): Promise<TwoStepCodeProblem | null> {
    switch (result.outcome) {
      case "turned_on":
        setStep({ name: STEP.CODES, codes: result.recoveryCodes });
        return null;
      case "wrong_code":
        return { codeError: MESSAGES.wrongSetupCode };
      case "rate_limited":
        return { failure: MESSAGES.tooManyTries };
      case "not_started":
        setStep({ name: STEP.PASSWORD, notice: MESSAGES.restarted });
        return null;
      case "already_on":
        setStep({ name: STEP.ON_WITHOUT_CODES });
        return null;
      case "unknown":
        await findOutWhatHappened(setup);
        return null;
    }
  }

  async function submitCode(setup: TotpSetup, code: string): Promise<TwoStepCodeProblem | null> {
    onLeaveRiskChange("turning_on");
    const result = await requestTwoStepVerify(code);
    const problem = await settleCode(setup, result);
    onLeaveRiskChange(result.outcome === "turned_on" ? "codes" : "none");
    return problem;
  }

  function turnOffSettled(result: TwoStepTurnOffSettled): void {
    setIsTurningOff(false);
    if (result === "unknown") {
      setStep({ name: STEP.ON_WITHOUT_CODES });
      showToast(MESSAGES.unsure, "error");
      return;
    }
    setStep({ name: STEP.PASSWORD, notice: null });
  }

  return (
    <View style={{ flex: 1 }}>
      <KeyboardAwareScroll
        contentContainerStyle={{ gap: spacing.md, padding: spacing.lg }}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
      >
        {step.name === STEP.PASSWORD ? (
          <TwoStepPasswordStep
            appName={appName}
            notice={step.notice}
            onAlreadyOn={() => {
              showToast(MESSAGES.alreadyOnToast, "success");
              onFinished();
            }}
            onStarted={(setup) => setStep({ name: STEP.ADD, setup, notice: null })}
          />
        ) : null}
        {step.name === STEP.ADD ? (
          <TwoStepAddStep
            appName={appName}
            key={addAttempt}
            notice={step.notice}
            onSubmit={(code) => submitCode(step.setup, code)}
            setup={step.setup}
          />
        ) : null}
        {step.name === STEP.CODES ? (
          <TwoStepRecoveryCodes
            codes={step.codes}
            onDone={() => {
              onLeaveRiskChange("none");
              onFinished();
            }}
          />
        ) : null}
        {step.name === STEP.ON_WITHOUT_CODES ? (
          <>
            <Banner message={MESSAGES.lostOnHeading} />
            <LoadingButton onPress={() => setIsTurningOff(true)} variant="destructive">
              {MESSAGES.startOver}
            </LoadingButton>
            <LoadingButton onPress={onFinished} variant="secondary">
              {MESSAGES.keepOn}
            </LoadingButton>
            <Text style={{ color: colors.mutedForeground, fontSize: fontSize.sm }}>{MESSAGES.lostOnNote}</Text>
          </>
        ) : null}
        {step.name === STEP.UNSURE ? (
          <>
            <Banner message={MESSAGES.unsure} />
            <LoadingButton loadingText={MESSAGES.checking} onPress={() => findOutWhatHappened(step.setup)} variant="secondary">
              {MESSAGES.checkAgain}
            </LoadingButton>
          </>
        ) : null}
        {isTurningOff ? <TwoStepTurnOffSheet onClose={() => setIsTurningOff(false)} onSettled={turnOffSettled} /> : null}
      </KeyboardAwareScroll>
    </View>
  );
}
