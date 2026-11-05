import { Stack } from "expo-router";
import TaxReportScreen from "../../../src/features/tax/TaxReportScreen";

export default function TaxReportRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Tax Report", headerBackTitle: "More" }} />
      <TaxReportScreen />
    </>
  );
}
