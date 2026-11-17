import { Stack, useLocalSearchParams } from "expo-router";
import WelcomeManualRoomsScreen from "../../../../src/features/welcomeManuals/WelcomeManualRoomsScreen";
import ValidRoute from "../../../../src/features/routing/ValidRoute";

export default function WelcomeManualRoomsRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Rooms", headerBackTitle: "Manual" }} />
      <ValidRoute uuids={["id"]}>
        <WelcomeManualRoomsScreen manualId={id} />
      </ValidRoute>
    </>
  );
}
