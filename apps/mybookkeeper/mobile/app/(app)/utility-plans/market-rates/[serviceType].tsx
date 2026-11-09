import { Stack, useLocalSearchParams } from "expo-router";
import MarketRateFormScreen from "../../../../src/features/utilityPlans/MarketRateFormScreen";

export default function MarketRateFormRoute() {
  const { serviceType } = useLocalSearchParams<{ serviceType: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Market rate", headerBackTitle: "Market rates" }} />
      <MarketRateFormScreen serviceType={serviceType} />
    </>
  );
}
