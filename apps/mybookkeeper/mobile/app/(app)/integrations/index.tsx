import { Stack } from "expo-router";
import { INTEGRATIONS_MESSAGES } from "../../../src/constants/integrations";
import IntegrationsScreen from "../../../src/features/integrations/IntegrationsScreen";

export default function IntegrationsRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: INTEGRATIONS_MESSAGES.title, headerBackTitle: "More" }} />
      <IntegrationsScreen />
    </>
  );
}
