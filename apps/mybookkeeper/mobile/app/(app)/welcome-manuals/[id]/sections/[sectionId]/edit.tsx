import { Stack, useLocalSearchParams } from "expo-router";
import WelcomeManualSectionEditScreen from "../../../../../../src/features/welcomeManuals/WelcomeManualSectionEditScreen";
import ValidRoute from "../../../../../../src/features/routing/ValidRoute";

export default function WelcomeManualSectionEditRoute() {
  const { id, sectionId } = useLocalSearchParams<{ id: string; sectionId: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Edit section", headerBackTitle: "Section" }} />
      <ValidRoute uuids={["id", "sectionId"]}>
        <WelcomeManualSectionEditScreen manualId={id} sectionId={sectionId} />
      </ValidRoute>
    </>
  );
}
