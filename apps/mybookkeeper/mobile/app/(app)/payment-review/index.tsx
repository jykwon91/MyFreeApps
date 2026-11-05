import { Stack } from "expo-router";
import PaymentReviewScreen from "../../../src/features/paymentReview/PaymentReviewScreen";

export default function PaymentReviewRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Payment Review", headerBackTitle: "More" }} />
      <PaymentReviewScreen />
    </>
  );
}
