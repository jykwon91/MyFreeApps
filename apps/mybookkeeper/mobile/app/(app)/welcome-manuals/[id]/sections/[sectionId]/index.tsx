import { Stack, useLocalSearchParams } from "expo-router";
import WelcomeManualSectionDetailScreen from "../../../../../../src/features/welcomeManuals/WelcomeManualSectionDetailScreen";
import ValidRoute from "../../../../../../src/features/routing/ValidRoute";

export default function WelcomeManualSectionDetailRoute() {
  const { id, sectionId } = useLocalSearchParams<{ id: string; sectionId: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Section", headerBackTitle: "Sections" }} />
      <ValidRoute uuids={["id", "sectionId"]}>
        <WelcomeManualSectionDetailScreen manualId={id} sectionId={sectionId} />
      </ValidRoute>
    </>
  );
}
