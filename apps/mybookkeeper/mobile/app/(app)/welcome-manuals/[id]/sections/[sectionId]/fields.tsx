import { Stack, useLocalSearchParams } from "expo-router";
import WelcomeManualFieldsScreen from "../../../../../../src/features/welcomeManuals/WelcomeManualFieldsScreen";
import ValidRoute from "../../../../../../src/features/routing/ValidRoute";

export default function WelcomeManualFieldsRoute() {
  const { id, sectionId } = useLocalSearchParams<{ id: string; sectionId: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Fields", headerBackTitle: "Section" }} />
      <ValidRoute uuids={["id", "sectionId"]}>
        <WelcomeManualFieldsScreen manualId={id} sectionId={sectionId} />
      </ValidRoute>
    </>
  );
}
