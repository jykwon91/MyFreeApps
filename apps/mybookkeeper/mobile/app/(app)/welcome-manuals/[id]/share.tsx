import { Stack, useLocalSearchParams } from "expo-router";
import WelcomeManualShareScreen from "../../../../src/features/welcomeManuals/WelcomeManualShareScreen";
import ValidRoute from "../../../../src/features/routing/ValidRoute";

export default function WelcomeManualShareRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Share", headerBackTitle: "Manual" }} />
      <ValidRoute uuids={["id"]}>
        <WelcomeManualShareScreen manualId={id} />
      </ValidRoute>
    </>
  );
}
