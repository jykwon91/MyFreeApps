import { useGetInquiryByIdQuery } from "@mybookkeeper/api-client/store/inquiriesApi";
import { EmptyState, Skeleton, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { ScrollView } from "react-native";
import { httpStatus } from "@mybookkeeper/api-client/utils/httpStatus";
import PromoteForm from "./PromoteForm";

export default function PromoteScreen({ id }: { id: string }) {
  const { spacing } = useTheme();
  const { currentData: inquiry, error, isFetching, refetch } = useGetInquiryByIdQuery(id);
  const isGone = httpStatus(error) === 404;

  if (inquiry) return <PromoteForm inquiry={inquiry} />;
  if (!isGone && (isFetching || !error)) {
    return (
      <ScrollView accessibilityLabel="Loading this inquiry" contentContainerStyle={{ gap: spacing.lg, padding: spacing.lg }} contentInsetAdjustmentBehavior="automatic" scrollEnabled={false}>
        <Skeleton height={48} />
        <Skeleton height={48} />
        <Skeleton height={48} />
        <Skeleton height={48} />
      </ScrollView>
    );
  }
  return (
    <EmptyState
      action={isGone ? { label: "Back", onPress: () => router.back() } : { label: "Try again", onPress: () => void refetch() }}
      body={isGone ? "It may have been archived." : "Want me to try again?"}
      heading={isGone ? "I can't find that inquiry." : "I couldn't load that inquiry."}
    />
  );
}
