import { Stack, useLocalSearchParams } from "expo-router";
import WelcomeManualPhotosScreen from "../../../../../../src/features/welcomeManuals/WelcomeManualPhotosScreen";

export default function WelcomeManualPhotosRoute() {
  const { id, sectionId } = useLocalSearchParams<{ id: string; sectionId: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Photos", headerBackTitle: "Section" }} />
      <WelcomeManualPhotosScreen manualId={id} sectionId={sectionId} />
    </>
  );
}
