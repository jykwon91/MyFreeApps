import { Stack, useLocalSearchParams } from "expo-router";
import WelcomeManualPreviewScreen from "../../../../src/features/welcomeManuals/WelcomeManualPreviewScreen";
import ValidRoute from "../../../../src/features/routing/ValidRoute";

export default function WelcomeManualPreviewRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Preview", headerBackTitle: "Manual" }} />
      <ValidRoute uuids={["id"]}>
        <WelcomeManualPreviewScreen manualId={id} />
      </ValidRoute>
    </>
  );
}
