import { Stack, useLocalSearchParams } from "expo-router";
import TaxFieldOverrideScreen from "../../../../src/features/taxReturns/TaxFieldOverrideScreen";
import ValidRoute from "../../../../src/features/routing/ValidRoute";

export default function TaxFieldOverrideRoute() {
  const { id, form, field } = useLocalSearchParams<{ id: string; form: string; field: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Override a value", headerBackTitle: "Form" }} />
      <ValidRoute uuids={["id", "field"]}>
        <TaxFieldOverrideScreen fieldRowId={field} formName={form} returnId={id} />
      </ValidRoute>
    </>
  );
}
