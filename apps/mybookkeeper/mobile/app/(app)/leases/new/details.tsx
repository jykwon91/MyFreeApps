import { Stack, useLocalSearchParams } from "expo-router";
import NewLeaseDetailsScreen from "../../../../src/features/newLease/NewLeaseDetailsScreen";
import { flowFromParams } from "../../../../src/features/newLease/newLeaseFlow";
import type { NewLeaseRouteParams } from "../../../../src/types/NewLeaseRouteParams";

export default function NewLeaseDetailsRoute() {
  const params = useLocalSearchParams<NewLeaseRouteParams>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "New lease", headerBackTitle: "Back" }} />
      <NewLeaseDetailsScreen flow={flowFromParams(params)} />
    </>
  );
}
