import { Stack, useLocalSearchParams } from "expo-router";
import { INTEGRATIONS_MESSAGES } from "../../../../src/constants/integrations";
import SyncSessionScreen from "../../../../src/features/integrations/SyncSessionScreen";
import ValidRoute from "../../../../src/features/routing/ValidRoute";

export default function SyncSessionRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: INTEGRATIONS_MESSAGES.sessionTitle, headerBackTitle: INTEGRATIONS_MESSAGES.title }} />
      <ValidRoute integers={["id"]}>
        <SyncSessionScreen id={Number(id)} />
      </ValidRoute>
    </>
  );
}
