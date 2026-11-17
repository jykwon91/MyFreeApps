import { Stack, useLocalSearchParams } from "expo-router";
import WelcomeManualEmailScreen from "../../../../src/features/welcomeManuals/WelcomeManualEmailScreen";
import ValidRoute from "../../../../src/features/routing/ValidRoute";

export default function WelcomeManualEmailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Email the guide", headerBackTitle: "Manual" }} />
      <ValidRoute uuids={["id"]}>
        <WelcomeManualEmailScreen manualId={id} />
      </ValidRoute>
    </>
  );
}
