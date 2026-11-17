import { Stack, useLocalSearchParams } from "expo-router";
import WelcomeManualEditScreen from "../../../../src/features/welcomeManuals/WelcomeManualEditScreen";
import ValidRoute from "../../../../src/features/routing/ValidRoute";

export default function WelcomeManualEditRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Edit manual", headerBackTitle: "Manual" }} />
      <ValidRoute uuids={["id"]}>
        <WelcomeManualEditScreen id={id} />
      </ValidRoute>
    </>
  );
}
