import { Stack, useLocalSearchParams } from "expo-router";
import TaxReturnDetailScreen from "../../../../src/features/taxReturns/TaxReturnDetailScreen";
import ValidRoute from "../../../../src/features/routing/ValidRoute";

export default function TaxReturnRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Tax Return", headerBackTitle: "Tax Returns" }} />
      <ValidRoute uuids={["id"]}>
        <TaxReturnDetailScreen id={id} />
      </ValidRoute>
    </>
  );
}
