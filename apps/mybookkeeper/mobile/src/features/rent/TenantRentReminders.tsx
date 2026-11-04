import { useGetRentLedgerQuery } from "@mybookkeeper/api-client/store/rentLedgerApi";
import { useGetRentReminderOverviewQuery } from "@mybookkeeper/api-client/store/rentRemindersApi";
import { describePlan } from "@mybookkeeper/api-client/utils/rentReminderFormat";
import { LoadingButton, Skeleton, useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { WEB_BASE_URL } from "../../constants/api";
import { SHOWING_LAST_LOADED_MESSAGE } from "../../constants/offline";
import { REMINDER_MESSAGES } from "../../constants/rentReminders";
import InquiryChip from "../inquiries/InquiryChip";
import InquirySection from "../inquiries/InquirySection";
import { useOpenLink } from "../inquiries/useOpenLink";
import { useCanWrite } from "../workspace/useCanWrite";
import RentReminderHistory from "./RentReminderHistory";
import RentReminderNext from "./RentReminderNext";

interface TenantRentRemindersProps {
  applicantId: string;
  name: string | null;
  /** The server stops reminders on this alone. A lease that ran out doesn't stop them. */
  hasEnded: boolean;
}

export default function TenantRentReminders({ applicantId, name, hasEnded }: TenantRentRemindersProps) {
  const { colors, spacing, fontSize } = useTheme();
  const { currentData: overview, error, isFetching, refetch } = useGetRentReminderOverviewQuery(applicantId, { refetchOnFocus: true });
  const { currentData: ledger, isFetching: isLedgerFetching } = useGetRentLedgerQuery({ applicantId });
  const canWrite = useCanWrite();
  const openLink = useOpenLink();
  const mutedText = { fontSize: fontSize.sm, color: colors.mutedForeground };
  const openWebsite = () => void openLink(`${WEB_BASE_URL}/applicants/${applicantId}`);

  if (!overview && isFetching) {
    return (
      <InquirySection title={REMINDER_MESSAGES.section}>
        <View accessible accessibilityLabel={REMINDER_MESSAGES.loading} accessibilityState={{ busy: true }} style={{ gap: spacing.sm }}>
          <Skeleton height={24} width="70%" />
          <Skeleton height={96} width="100%" />
          <Skeleton height={56} width="100%" />
          <Skeleton height={20} width="100%" />
          <Skeleton height={20} width="100%" />
        </View>
      </InquirySection>
    );
  }
  if (!overview) {
    return (
      <InquirySection title={REMINDER_MESSAGES.section}>
        <Text style={mutedText}>{REMINDER_MESSAGES.couldntLoad}</Text>
        <LoadingButton onPress={() => void refetch()} variant="ghost">
          {REMINDER_MESSAGES.tryAgain}
        </LoadingButton>
      </InquirySection>
    );
  }

  const { plan } = overview;
  if (!plan) {
    if (hasEnded) {
      return (
        <InquirySection title={REMINDER_MESSAGES.section}>
          <Text style={mutedText}>{REMINDER_MESSAGES.tenancyEnded}</Text>
        </InquirySection>
      );
    }
    if (!ledger && isLedgerFetching) {
      return (
        <InquirySection title={REMINDER_MESSAGES.section}>
          <Skeleton height={56} width="100%" />
        </InquirySection>
      );
    }
    const needsSchedule = ledger?.schedules.length === 0;
    return (
      <InquirySection title={REMINDER_MESSAGES.section}>
        {error ? <Text style={mutedText}>{SHOWING_LAST_LOADED_MESSAGE}</Text> : null}
        <Text style={mutedText}>{needsSchedule ? REMINDER_MESSAGES.needsSchedule : REMINDER_MESSAGES.notSending}</Text>
        {canWrite ? (
          <LoadingButton onPress={openWebsite} variant="secondary">
            {needsSchedule ? REMINDER_MESSAGES.setUpOnWebsite : REMINDER_MESSAGES.turnOnOnWebsite}
          </LoadingButton>
        ) : null}
      </InquirySection>
    );
  }

  return (
    <InquirySection title={REMINDER_MESSAGES.section}>
      {error ? <Text style={mutedText}>{SHOWING_LAST_LOADED_MESSAGE}</Text> : null}
      <Text style={{ fontSize: fontSize.sm, color: colors.foreground }}>{describePlan(plan)}</Text>
      {plan.is_active ? null : (
        <>
          <InquiryChip label={REMINDER_MESSAGES.paused} />
          <Text style={mutedText}>{REMINDER_MESSAGES.pausedNote}</Text>
        </>
      )}
      {hasEnded ? <Text style={mutedText}>{REMINDER_MESSAGES.tenancyEnded}</Text> : null}
      <RentReminderNext applicantId={applicantId} isStale={Boolean(error)} name={name} overview={overview} plan={plan} showSend={canWrite && !hasEnded} />
      <RentReminderHistory applicantId={applicantId} />
      {canWrite ? (
        <>
          <Text style={mutedText}>{REMINDER_MESSAGES.changeOnWebsite}</Text>
          <LoadingButton onPress={openWebsite} variant="ghost">
            {REMINDER_MESSAGES.openWebsite}
          </LoadingButton>
        </>
      ) : null}
    </InquirySection>
  );
}
