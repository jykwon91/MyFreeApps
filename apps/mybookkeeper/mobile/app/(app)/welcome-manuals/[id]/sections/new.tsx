import { Stack, useLocalSearchParams } from "expo-router";
import WelcomeManualSectionCreateScreen from "../../../../../src/features/welcomeManuals/WelcomeManualSectionCreateScreen";

export default function WelcomeManualSectionCreateRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "New section", headerBackTitle: "Sections" }} />
      <WelcomeManualSectionCreateScreen manualId={id} />
    </>
  );
}
