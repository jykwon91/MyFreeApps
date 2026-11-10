import { Stack, useLocalSearchParams } from "expo-router";
import { APPLICATION_DETAIL_MESSAGES as MESSAGES } from "../../../src/constants/applicationDetail";
import ApplicationDetailScreen from "../../../src/features/applicationDetail/ApplicationDetailScreen";

export default function ApplicationRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: MESSAGES.screenTitle, headerBackTitle: MESSAGES.backTitle }} />
      <ApplicationDetailScreen id={id} />
    </>
  );
}
