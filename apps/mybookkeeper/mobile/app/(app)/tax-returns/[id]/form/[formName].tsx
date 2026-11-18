import { getFormLabel } from "@mybookkeeper/api-client/utils/taxFormLabel";
import { Stack, useLocalSearchParams } from "expo-router";
import TaxFormScreen from "../../../../../src/features/taxReturns/TaxFormScreen";
import ValidRoute from "../../../../../src/features/routing/ValidRoute";

export default function TaxFormRoute() {
  const { id, formName } = useLocalSearchParams<{ id: string; formName: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: getFormLabel(formName), headerBackTitle: "Tax Return" }} />
      <ValidRoute uuids={["id"]}>
        <TaxFormScreen formName={formName} returnId={id} />
      </ValidRoute>
    </>
  );
}
