import { Stack, useLocalSearchParams } from "expo-router";
import WelcomeManualSectionDetailScreen from "../../../../../../src/features/welcomeManuals/WelcomeManualSectionDetailScreen";

export default function WelcomeManualSectionDetailRoute() {
  const { id, sectionId } = useLocalSearchParams<{ id: string; sectionId: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Section", headerBackTitle: "Sections" }} />
      <WelcomeManualSectionDetailScreen manualId={id} sectionId={sectionId} />
    </>
  );
}
