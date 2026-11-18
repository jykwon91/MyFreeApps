import { Stack, useLocalSearchParams } from "expo-router";
import WelcomeManualPlacesScreen from "../../../../src/features/welcomeManuals/WelcomeManualPlacesScreen";
import ValidRoute from "../../../../src/features/routing/ValidRoute";

export default function WelcomeManualPlacesRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Where to eat", headerBackTitle: "Manual" }} />
      <ValidRoute uuids={["id"]}>
        <WelcomeManualPlacesScreen manualId={id} />
      </ValidRoute>
    </>
  );
}
