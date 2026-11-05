import { Stack, useLocalSearchParams } from "expo-router";
import TemplatePickerScreen from "../../../../src/features/newLease/TemplatePickerScreen";
import { flowFromParams } from "../../../../src/features/newLease/newLeaseFlow";
import type { NewLeaseRouteParams } from "../../../../src/types/NewLeaseRouteParams";

export default function NewLeaseTemplatesRoute() {
  const params = useLocalSearchParams<NewLeaseRouteParams>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "New lease", headerBackTitle: "Cancel" }} />
      <TemplatePickerScreen flow={flowFromParams(params)} />
    </>
  );
}
