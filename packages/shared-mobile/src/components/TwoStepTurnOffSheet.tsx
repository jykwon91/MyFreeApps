import { useState } from "react";
import { Modal, ScrollView, Text, View } from "react-native";
import { requestTwoStepDisable } from "../auth/twoStepApi";
import { TWO_STEP_MESSAGES as MESSAGES } from "../constants/twoStep";
import { useSecondFactorCode } from "../hooks/useSecondFactorCode";
import { useTheme } from "../theme/useTheme";
import type { TwoStepTurnOffSheetProps } from "../types/TwoStepTurnOffSheetProps";
import Banner from "./Banner";
import FormField from "./FormField";
import LoadingButton from "./LoadingButton";

export default function TwoStepTurnOffSheet({ onClose, onSettled }: TwoStepTurnOffSheetProps) {
  const { colors, spacing, fontSize } = useTheme();
  const secondFactor = useSecondFactorCode();
  const [codeError, setCodeError] = useState<string | undefined>();
  const [failure, setFailure] = useState<string | null>(null);
  const [isTurningOff, setIsTurningOff] = useState(false);

  function close(): void {
    if (!isTurningOff) onClose();
  }

  async function submit(): Promise<void> {
    setCodeError(undefined);
    setFailure(null);
    setIsTurningOff(true);
    const result = await requestTwoStepDisable(secondFactor.code);
    setIsTurningOff(false);
    switch (result) {
      case "wrong_code":
        secondFactor.clear();
        setCodeError(MESSAGES.wrongTurnOffCode);
        return;
      case "rate_limited":
        secondFactor.clear();
        setFailure(MESSAGES.tooManyTries);
        return;
      default:
        onSettled(result);
    }
  }

  return (
    <Modal animationType="slide" onRequestClose={close} presentationStyle="pageSheet" visible>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <ScrollView automaticallyAdjustKeyboardInsets contentContainerStyle={{ gap: spacing.md, padding: spacing.lg }} keyboardShouldPersistTaps="handled">
          <Text accessibilityRole="header" style={{ color: colors.foreground, fontSize: fontSize.lg, fontWeight: "600" }}>
            {MESSAGES.turnOffCodeHeading}
          </Text>
          {failure ? <Banner message={failure} /> : null}
          <FormField
            autoComplete="one-time-code"
            autoFocus
            editable={!isTurningOff}
            error={codeError}
            keyboardType="number-pad"
            label={MESSAGES.turnOffCodeLabel}
            onChangeText={secondFactor.change}
            textContentType="oneTimeCode"
            value={secondFactor.code}
          />
          <LoadingButton
            disabled={!secondFactor.isComplete}
            isLoading={isTurningOff}
            loadingText={MESSAGES.turningOff}
            onPress={submit}
            variant="destructive"
          >
            {MESSAGES.confirmTurnOff}
          </LoadingButton>
          <LoadingButton disabled={isTurningOff} onPress={close} variant="ghost">
            {MESSAGES.cancel}
          </LoadingButton>
          <Text style={{ color: colors.mutedForeground, fontSize: fontSize.sm }}>{MESSAGES.turnOffNote}</Text>
        </ScrollView>
      </View>
    </Modal>
  );
}
