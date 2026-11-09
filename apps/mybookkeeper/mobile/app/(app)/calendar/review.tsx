import { Stack } from "expo-router";
import ReviewQueueScreen from "../../../src/features/calendarReview/ReviewQueueScreen";

export default function ReviewQueueRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Review queue", headerBackTitle: "Calendar" }} />
      <ReviewQueueScreen />
    </>
  );
}
