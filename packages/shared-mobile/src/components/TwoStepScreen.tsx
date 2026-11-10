import { useState } from "react";
import { Alert, ScrollView, Text, View } from "react-native";
import { TWO_STEP_MESSAGES as MESSAGES } from "../constants/twoStep";
import { useRefresh } from "../hooks/useRefresh";
import { useToast } from "../hooks/useToast";
import { useTwoStepStatus } from "../hooks/useTwoStepStatus";
import { useTheme } from "../theme/useTheme";
import type { TwoStepScreenProps } from "../types/TwoStepScreenProps";
import type { TwoStepTurnOffSettled } from "../types/TwoStepTurnOffSettled";
import Banner from "./Banner";
import EmptyState from "./EmptyState";
import LoadingButton from "./LoadingButton";
import Skeleton from "./Skeleton";
import TwoStepTurnOffSheet from "./TwoStepTurnOffSheet";
import WebLink from "./WebLink";

export default function TwoStepScreen({ whatItProtects, webBaseUrl, webPath, confirmOwner, onTurnOn, reloadSignal }: TwoStepScreenProps) {
  const { colors, spacing, fontSize } = useTheme();
  const { showToast } = useToast();
  const { enabled, failure, successfulReads, reload, markEnabled } = useTwoStepStatus(reloadSignal);
  const { refreshControl } = useRefresh(reload, failure);
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
      <View style={{ gap: spacing.md, padding: spacing.lg }} testID="two-step-skeleton">
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
    <ScrollView
      contentContainerStyle={{ gap: spacing.md, padding: spacing.lg }}
      contentInsetAdjustmentBehavior="automatic"
      refreshControl={refreshControl}
    >
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
      <View>
        <Text style={{ color: colors.mutedForeground, fontSize: fontSize.sm }}>{MESSAGES.websiteNote}</Text>
        <WebLink label={MESSAGES.openWebsite} webPath={webPath} webBaseUrl={webBaseUrl} />
      </View>
      {isTurningOff ? <TwoStepTurnOffSheet onClose={() => setIsTurningOff(false)} onSettled={turnOffSettled} /> : null}
    </ScrollView>
  );
}
