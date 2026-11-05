import { Stack, useLocalSearchParams } from "expo-router";
import ApplicantPickerScreen from "../../../../src/features/newLease/ApplicantPickerScreen";
import { flowFromParams } from "../../../../src/features/newLease/newLeaseFlow";
import type { NewLeaseRouteParams } from "../../../../src/types/NewLeaseRouteParams";

export default function NewLeaseApplicantRoute() {
  const params = useLocalSearchParams<NewLeaseRouteParams>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "New lease", headerBackTitle: "Back" }} />
      <ApplicantPickerScreen flow={flowFromParams(params)} />
    </>
  );
}
