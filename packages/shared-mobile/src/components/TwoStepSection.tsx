import { useState } from "react";
import { Alert, Text, View } from "react-native";
import { TWO_STEP_MESSAGES as MESSAGES } from "../constants/twoStep";
import { useToast } from "../hooks/useToast";
import { useTheme } from "../theme/useTheme";
import type { TwoStepSectionProps } from "../types/TwoStepSectionProps";
import type { TwoStepTurnOffSettled } from "../types/TwoStepTurnOffSettled";
import Banner from "./Banner";
import EmptyState from "./EmptyState";
import LoadingButton from "./LoadingButton";
import Skeleton from "./Skeleton";
import TwoStepTurnOffSheet from "./TwoStepTurnOffSheet";

/** Two-step sign-in: whether it's on, and turning it on or off. For a screen to scroll and refresh. */
export default function TwoStepSection({ status, whatItProtects, confirmOwner, onTurnOn }: TwoStepSectionProps) {
  const { colors, spacing, fontSize } = useTheme();
  const { showToast } = useToast();
  const { enabled, failure, successfulReads, reload, markEnabled } = status;
  const [problem, setProblem] = useState<string | null>(null);
  const [unsureAtRead, setUnsureAtRead] = useState<number | null>(null);
  const [isTurningOff, setIsTurningOff] = useState(false);

  async function isOwner(): Promise<boolean> {
    setProblem(null);
    const { confirmed, problem: couldntAsk } = await confirmOwner();
    setProblem(couldntAsk);
    return confirmed;
  }

  async function turnOn(): Promise<void> {
    if (await isOwner()) onTurnOn();
  }

  async function askToTurnOff(): Promise<void> {
    if (!(await isOwner())) return;
    Alert.alert(MESSAGES.turnOffTitle, MESSAGES.turnOffBody, [
      { text: MESSAGES.cancel, style: "cancel" },
      { text: MESSAGES.confirmTurnOff, style: "destructive", onPress: () => setIsTurningOff(true) },
    ]);
  }

  function turnOffSettled(result: TwoStepTurnOffSettled): void {
    setIsTurningOff(false);
    if (result === "unknown") {
      setUnsureAtRead(successfulReads);
      return;
    }
    markEnabled(false);
    showToast(result === "turned_off" ? MESSAGES.turnedOff : MESSAGES.alreadyOff, "success");
    void reload();
  }

  if (enabled === null && failure === null) {
    return (
      <View style={{ gap: spacing.md }} testID="two-step-skeleton">
        <Skeleton height={24} width="50%" />
        <Skeleton height={64} />
        <Skeleton height={48} />
      </View>
    );
  }

  if (enabled === null) {
    return (
      <EmptyState
        action={{ label: MESSAGES.tryAgain, onPress: reload }}
        body={failure === "server" ? MESSAGES.loadFailedServer : MESSAGES.loadFailedConnection}
        heading={MESSAGES.loadFailed}
      />
    );
  }

  return (
    <View style={{ gap: spacing.md }}>
      {failure ? <Banner message={MESSAGES.refreshFailed} /> : null}
      {problem ? <Banner message={problem} /> : null}
      {unsureAtRead === successfulReads ? <Banner message={MESSAGES.turnOffUnsure} /> : null}
      <Text accessibilityRole="header" style={{ color: colors.foreground, fontSize: fontSize.lg, fontWeight: "600" }}>
        {MESSAGES.heading}
      </Text>
      {enabled ? (
        <>
          <Text style={{ color: colors.foreground, fontSize: fontSize.sm }}>{MESSAGES.onBody}</Text>
          <Text style={{ color: colors.mutedForeground, fontSize: fontSize.sm }}>{MESSAGES.onCodesNote}</Text>
          <LoadingButton onPress={askToTurnOff} variant="destructive">
            {MESSAGES.turnOff}
          </LoadingButton>
        </>
      ) : (
        <>
          <Text style={{ color: colors.foreground, fontSize: fontSize.sm }}>{MESSAGES.offBody(whatItProtects)}</Text>
          <LoadingButton onPress={turnOn}>{MESSAGES.turnOn}</LoadingButton>
        </>
      )}
      {isTurningOff ? <TwoStepTurnOffSheet onClose={() => setIsTurningOff(false)} onSettled={turnOffSettled} /> : null}
    </View>
  );
}
