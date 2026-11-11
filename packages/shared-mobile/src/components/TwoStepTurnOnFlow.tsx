import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Alert } from "react-native";
import { TWO_STEP_MESSAGES as MESSAGES } from "../constants/twoStep";
import { useConfirmLeave } from "../hooks/useConfirmLeave";
import type { TwoStepLeaveRisk } from "../types/TwoStepLeaveRisk";
import type { TwoStepTurnOnFlowProps } from "../types/TwoStepTurnOnFlowProps";
import TwoStepTurnOnScreen from "./TwoStepTurnOnScreen";

/** The turn-on screen as a route: it asks before leaving with codes unsaved, and goes back when done. */
export default function TwoStepTurnOnFlow({ appName, securityRoute }: TwoStepTurnOnFlowProps) {
  const [leaveRisk, setLeaveRisk] = useState<TwoStepLeaveRisk>("none");
  const [isFinished, setIsFinished] = useState(false);

  useConfirmLeave(leaveRisk !== "none", (leave) => {
    if (leaveRisk === "turning_on") {
      Alert.alert(MESSAGES.stillTurningOnTitle, MESSAGES.stillTurningOnBody, [{ text: MESSAGES.stay, style: "cancel" }]);
      return;
    }
    Alert.alert(MESSAGES.leaveTitle, MESSAGES.leaveBody, [
      { text: MESSAGES.stay, style: "cancel" },
      { text: MESSAGES.leaveAnyway, style: "destructive", onPress: leave },
    ]);
  });

  // After the render that lifts the guard, or leaving would still be stopped by it.
  useEffect(() => {
    if (!isFinished) return;
    if (router.canGoBack()) router.back();
    else router.replace(securityRoute);
  }, [isFinished, securityRoute]);

  return <TwoStepTurnOnScreen appName={appName} onFinished={() => setIsFinished(true)} onLeaveRiskChange={setLeaveRisk} />;
}
