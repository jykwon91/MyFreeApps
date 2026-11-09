import { Stack } from "expo-router";
import RateWatchScreen from "../../../src/features/insurance/RateWatchScreen";

export default function RateWatchRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Rate increases", headerBackTitle: "Insurance" }} />
      <RateWatchScreen />
    </>
  );
}
