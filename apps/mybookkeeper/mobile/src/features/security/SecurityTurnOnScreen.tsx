import { TWO_STEP_MESSAGES as MESSAGES, type TwoStepLeaveRisk, TwoStepTurnOnScreen } from "@platform/mobile";
import { router, usePreventRemove } from "expo-router";
import { useEffect, useState } from "react";
import { Alert } from "react-native";
import { APP_NAME, SECURITY_ROUTE } from "../../constants/security";

export default function SecurityTurnOnScreen() {
  const [leaveRisk, setLeaveRisk] = useState<TwoStepLeaveRisk>("none");
  const [isFinished, setIsFinished] = useState(false);

  usePreventRemove(leaveRisk !== "none", ({ repeat }) => {
    if (leaveRisk === "turning_on") {
      Alert.alert(MESSAGES.stillTurningOnTitle, MESSAGES.stillTurningOnBody, [{ text: MESSAGES.stay, style: "cancel" }]);
      return;
    }
    Alert.alert(MESSAGES.leaveTitle, MESSAGES.leaveBody, [
      { text: MESSAGES.stay, style: "cancel" },
      {
        text: MESSAGES.leaveAnyway,
        style: "destructive",
        onPress: () => {
          setLeaveRisk("none");
          repeat();
        },
      },
    ]);
  });

  // After the render that lifts the guard, or leaving would still be stopped by it.
  useEffect(() => {
    if (!isFinished) return;
    if (router.canGoBack()) router.back();
    else router.replace(SECURITY_ROUTE);
  }, [isFinished]);

  return <TwoStepTurnOnScreen appName={APP_NAME} onFinished={() => setIsFinished(true)} onLeaveRiskChange={setLeaveRisk} />;
}
