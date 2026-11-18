import { Stack, useLocalSearchParams } from "expo-router";
import WelcomeManualDetailScreen from "../../../../src/features/welcomeManuals/WelcomeManualDetailScreen";
import ValidRoute from "../../../../src/features/routing/ValidRoute";

export default function WelcomeManualDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Manual", headerBackTitle: "Manuals" }} />
      <ValidRoute uuids={["id"]}>
        <WelcomeManualDetailScreen id={id} />
      </ValidRoute>
    </>
  );
}
