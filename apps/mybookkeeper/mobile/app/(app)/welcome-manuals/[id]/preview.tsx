import { Stack, useLocalSearchParams } from "expo-router";
import WelcomeManualPreviewScreen from "../../../../src/features/welcomeManuals/WelcomeManualPreviewScreen";

export default function WelcomeManualPreviewRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Preview", headerBackTitle: "Manual" }} />
      <WelcomeManualPreviewScreen manualId={id} />
    </>
  );
}
