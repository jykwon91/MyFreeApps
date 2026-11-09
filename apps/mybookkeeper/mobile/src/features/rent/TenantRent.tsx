import type { RentSchedule } from "@mybookkeeper/api-client/types/rent/rent-schedule";
import { useGetRentLedgerQuery } from "@mybookkeeper/api-client/store/rentLedgerApi";
import { LoadingButton, Skeleton, useTheme } from "@platform/mobile";
import { useState } from "react";
import { Text, View } from "react-native";
import { SHOWING_LAST_LOADED_MESSAGE } from "../../constants/offline";
import { RENT_MESSAGES } from "../../constants/rent";
import { RENT_MANAGE_MESSAGES } from "../../constants/rentManage";
import InquirySection from "../inquiries/InquirySection";
import { useCanWrite } from "../workspace/useCanWrite";
import RentBalance from "./RentBalance";
import RentCharges from "./RentCharges";
import RentCurrentPeriod from "./RentCurrentPeriod";
import RentScheduleLine from "./RentScheduleLine";
import RentScheduleSheet from "./RentScheduleSheet";

export default function TenantRent({ applicantId }: { applicantId: string }) {
  const { colors, spacing, fontSize } = useTheme();
  const { currentData: ledger, error, isFetching, refetch } = useGetRentLedgerQuery({ applicantId });
  const canWrite = useCanWrite();
  // `schedule: null` sets rent up from scratch.
  const [editing, setEditing] = useState<{ schedule: RentSchedule | null } | null>(null);
  const mutedText = { fontSize: fontSize.sm, color: colors.mutedForeground };

  if (!ledger && isFetching) {
    return (
      <InquirySection title={RENT_MESSAGES.section}>
        <View accessible accessibilityLabel={RENT_MESSAGES.loading} accessibilityState={{ busy: true }} style={{ gap: spacing.sm }}>
          <Skeleton height={24} width="60%" />
          <Skeleton height={72} width="100%" />
          <Skeleton height={24} width="50%" />
          <Skeleton height={56} width="100%" />
        </View>
      </InquirySection>
    );
  }
  if (!ledger) {
    return (
      <InquirySection title={RENT_MESSAGES.section}>
        <Text style={mutedText}>{RENT_MESSAGES.couldntLoad}</Text>
        <LoadingButton onPress={() => void refetch()} variant="ghost">
          {RENT_MESSAGES.tryAgain}
        </LoadingButton>
      </InquirySection>
    );
  }
  // One sheet outside both layouts, so saving rent doesn't tear it down when the empty state gives way to the ledger.
  const sheet = editing ? <RentScheduleSheet applicantId={applicantId} existing={editing.schedule} onClose={() => setEditing(null)} /> : null;
  if (ledger.schedules.length === 0 && ledger.charges.length === 0) {
    return (
      <>
        <InquirySection title={RENT_MESSAGES.section}>
          {error ? <Text style={mutedText}>{SHOWING_LAST_LOADED_MESSAGE}</Text> : null}
          <Text style={mutedText}>{RENT_MESSAGES.notSetUp}</Text>
          {canWrite ? (
            <LoadingButton onPress={() => setEditing({ schedule: null })} variant="secondary">
              {RENT_MANAGE_MESSAGES.setUp}
            </LoadingButton>
          ) : null}
        </InquirySection>
        {sheet}
      </>
    );
  }

  return (
    <>
      <InquirySection title={RENT_MESSAGES.section}>
        {error ? <Text style={mutedText}>{SHOWING_LAST_LOADED_MESSAGE}</Text> : null}
        {ledger.schedules.map((schedule) => (
          <RentScheduleLine key={schedule.id} onEdit={canWrite ? () => setEditing({ schedule }) : undefined} schedule={schedule} />
        ))}
        {ledger.current_period ? <RentCurrentPeriod period={ledger.current_period} /> : null}
        {!ledger.current_period && ledger.schedules.length > 0 && Number(ledger.balance) <= 0 ? <Text style={mutedText}>{RENT_MESSAGES.noneDue}</Text> : null}
        <RentBalance ledger={ledger} />
        <RentCharges applicantId={applicantId} canWrite={canWrite} charges={ledger.charges} />
        {canWrite && ledger.schedules.length === 0 ? (
          <LoadingButton onPress={() => setEditing({ schedule: null })} variant="secondary">
            {RENT_MANAGE_MESSAGES.setUp}
          </LoadingButton>
        ) : null}
      </InquirySection>
      {sheet}
    </>
  );
}
