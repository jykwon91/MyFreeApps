import { Stack } from "expo-router";
import RateWatchScreen from "../../../src/features/mortgages/RateWatchScreen";

export default function MortgageRatesRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Better rates", headerBackTitle: "Mortgages" }} />
      <RateWatchScreen />
    </>
  );
}
