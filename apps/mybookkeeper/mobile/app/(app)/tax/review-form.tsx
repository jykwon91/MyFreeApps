import { Stack, useLocalSearchParams } from "expo-router";
import TaxReviewFormScreen from "../../../src/features/tax/TaxReviewFormScreen";

export default function TaxReviewFormRoute() {
  const { year, form, instance, copy } = useLocalSearchParams<{ year: string; form: string; instance?: string; copy?: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Form review", headerBackTitle: "Tax Review" }} />
      <TaxReviewFormScreen formName={form} copy={Number(copy ?? 0)} instance={instance ?? ""} year={Number(year)} />
    </>
  );
}
