import { Stack, useLocalSearchParams } from "expo-router";
import WelcomeManualEmailScreen from "../../../../src/features/welcomeManuals/WelcomeManualEmailScreen";

export default function WelcomeManualEmailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Email the guide", headerBackTitle: "Manual" }} />
      <WelcomeManualEmailScreen manualId={id} />
    </>
  );
}
