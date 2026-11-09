import { Stack } from "expo-router";
import WelcomeManualCreateScreen from "../../../src/features/welcomeManuals/WelcomeManualCreateScreen";

export default function WelcomeManualCreateRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "New manual", headerBackTitle: "Manuals" }} />
      <WelcomeManualCreateScreen />
    </>
  );
}
