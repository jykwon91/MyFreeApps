import { Stack, useLocalSearchParams } from "expo-router";
import WelcomeManualPlacesScreen from "../../../../src/features/welcomeManuals/WelcomeManualPlacesScreen";

export default function WelcomeManualPlacesRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Where to eat", headerBackTitle: "Manual" }} />
      <WelcomeManualPlacesScreen manualId={id} />
    </>
  );
}
