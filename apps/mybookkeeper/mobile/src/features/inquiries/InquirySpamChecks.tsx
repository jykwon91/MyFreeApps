import { useGetInquirySpamAssessmentsQuery } from "@mybookkeeper/api-client/store/inquiriesApi";
import { LoadingButton, LoadingRegion, Skeleton, useTheme } from "@platform/mobile";
import { View } from "react-native";
import { INQUIRY_LOADING_MESSAGES } from "../../constants/inquiries";
import { spamCheckLabel, spamCheckResult } from "./inquiryDisplay";
import InquiryLine from "./InquiryLine";

export default function InquirySpamChecks({ id }: { id: string }) {
  const { spacing } = useTheme();
  const { data, error, isLoading, refetch } = useGetInquirySpamAssessmentsQuery(id);
  if (isLoading) {
    return (
      <LoadingRegion label={INQUIRY_LOADING_MESSAGES.spamChecks}>
        <Skeleton height={60} />
      </LoadingRegion>
    );
  }
  if (error && !data) {
    return (
      <LoadingButton onPress={() => refetch()} variant="secondary">
        I couldn't load those. Try again
      </LoadingButton>
    );
  }
  if (!data || data.length === 0) return <InquiryLine left="No checks ran on this one." muted />;
  return (
    <View style={{ gap: spacing.xs }}>
      {data.map((check) => (
        <InquiryLine key={check.id} left={spamCheckLabel(check)} right={spamCheckResult(check)} />
      ))}
    </View>
  );
}
