import { Stack, useLocalSearchParams } from "expo-router";
import WelcomeManualRoomsScreen from "../../../../src/features/welcomeManuals/WelcomeManualRoomsScreen";

export default function WelcomeManualRoomsRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Rooms", headerBackTitle: "Manual" }} />
      <WelcomeManualRoomsScreen manualId={id} />
    </>
  );
}
