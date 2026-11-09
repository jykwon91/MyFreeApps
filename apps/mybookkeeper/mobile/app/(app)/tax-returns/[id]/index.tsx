import { Stack, useLocalSearchParams } from "expo-router";
import TaxReturnDetailScreen from "../../../../src/features/taxReturns/TaxReturnDetailScreen";

export default function TaxReturnRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Tax Return", headerBackTitle: "Tax Returns" }} />
      <TaxReturnDetailScreen id={id} />
    </>
  );
}
