import { Stack, useLocalSearchParams } from "expo-router";
import WelcomeManualPhotosScreen from "../../../../../../src/features/welcomeManuals/WelcomeManualPhotosScreen";
import ValidRoute from "../../../../../../src/features/routing/ValidRoute";

export default function WelcomeManualPhotosRoute() {
  const { id, sectionId } = useLocalSearchParams<{ id: string; sectionId: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Photos", headerBackTitle: "Section" }} />
      <ValidRoute uuids={["id", "sectionId"]}>
        <WelcomeManualPhotosScreen manualId={id} sectionId={sectionId} />
      </ValidRoute>
    </>
  );
}
