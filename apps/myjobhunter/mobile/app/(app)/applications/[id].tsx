import { Stack, useLocalSearchParams } from "expo-router";
import { APPLICATION_DETAIL_MESSAGES as MESSAGES } from "../../../src/constants/applicationDetail";
import ApplicationDetailScreen from "../../../src/features/applicationDetail/ApplicationDetailScreen";
import ValidRoute from "../../../src/features/routing/ValidRoute";

export default function ApplicationRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: MESSAGES.screenTitle, headerBackTitle: MESSAGES.backTitle }} />
      <ValidRoute uuids={["id"]}>
        <ApplicationDetailScreen id={id} />
      </ValidRoute>
    </>
  );
}
