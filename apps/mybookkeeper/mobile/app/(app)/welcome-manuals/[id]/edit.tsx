import { Stack, useLocalSearchParams } from "expo-router";
import WelcomeManualEditScreen from "../../../../src/features/welcomeManuals/WelcomeManualEditScreen";

export default function WelcomeManualEditRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Edit manual", headerBackTitle: "Manual" }} />
      <WelcomeManualEditScreen id={id} />
    </>
  );
}
