import { Stack, useLocalSearchParams } from "expo-router";
import { INTEGRATIONS_MESSAGES } from "../../../../src/constants/integrations";
import SyncSessionScreen from "../../../../src/features/integrations/SyncSessionScreen";

export default function SyncSessionRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: INTEGRATIONS_MESSAGES.sessionTitle, headerBackTitle: INTEGRATIONS_MESSAGES.title }} />
      <SyncSessionScreen id={Number(id)} />
    </>
  );
}
