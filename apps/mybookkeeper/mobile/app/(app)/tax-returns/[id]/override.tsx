import { Stack, useLocalSearchParams } from "expo-router";
import TaxFieldOverrideScreen from "../../../../src/features/taxReturns/TaxFieldOverrideScreen";

export default function TaxFieldOverrideRoute() {
  const { id, form, field } = useLocalSearchParams<{ id: string; form: string; field: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Override a value", headerBackTitle: "Form" }} />
      <TaxFieldOverrideScreen fieldRowId={field} formName={form} returnId={id} />
    </>
  );
}
