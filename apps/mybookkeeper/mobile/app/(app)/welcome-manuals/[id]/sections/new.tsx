import { Stack, useLocalSearchParams } from "expo-router";
import WelcomeManualSectionCreateScreen from "../../../../../src/features/welcomeManuals/WelcomeManualSectionCreateScreen";
import ValidRoute from "../../../../../src/features/routing/ValidRoute";

export default function WelcomeManualSectionCreateRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "New section", headerBackTitle: "Sections" }} />
      <ValidRoute uuids={["id"]}>
        <WelcomeManualSectionCreateScreen manualId={id} />
      </ValidRoute>
    </>
  );
}
