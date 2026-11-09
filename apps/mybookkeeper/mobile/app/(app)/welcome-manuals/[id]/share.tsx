import { Stack, useLocalSearchParams } from "expo-router";
import WelcomeManualShareScreen from "../../../../src/features/welcomeManuals/WelcomeManualShareScreen";

export default function WelcomeManualShareRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Share", headerBackTitle: "Manual" }} />
      <WelcomeManualShareScreen manualId={id} />
    </>
  );
}
