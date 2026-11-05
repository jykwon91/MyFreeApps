import { useGetApplicantsQuery } from "@mybookkeeper/api-client/store/applicantsApi";
import { Banner, EmptyState, useRefresh, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { useMemo } from "react";
import { FlatList, Text, View } from "react-native";
import { STAGES_READY_FOR_LEASE } from "../../constants/applicants";
import { NEW_LEASE_APPLICANT_LIMIT, NEW_LEASE_MESSAGES as MESSAGES } from "../../constants/newLease";
import { SHOWING_LAST_LOADED_MESSAGE } from "../../constants/offline";
import { uniqueById } from "../../lib/uniqueById";
import type { NewLeaseFlow } from "../../types/NewLeaseFlow";
import ApplicantRow from "../applicants/ApplicantRow";
import ApplicantsSkeleton from "../applicants/ApplicantsSkeleton";
import MoreOnWebsite from "./MoreOnWebsite";
import { nextPath } from "./newLeaseFlow";

const [APPROVED, LEASE_SENT] = STAGES_READY_FOR_LEASE;

export default function ApplicantPickerScreen({ flow }: { flow: NewLeaseFlow }) {
  const { colors, spacing, fontSize } = useTheme();
  // The server filters on one stage at a time.
  const approved = useGetApplicantsQuery({ stage: APPROVED, limit: NEW_LEASE_APPLICANT_LIMIT });
  const leaseSent = useGetApplicantsQuery({ stage: LEASE_SENT, limit: NEW_LEASE_APPLICANT_LIMIT });
  const error = approved.error ?? leaseSent.error;
  const { refresh, refreshControl } = useRefresh(() => Promise.all([approved.refetch(), leaseSent.refetch()]), error);
  const isLoaded = Boolean(approved.currentData && leaseSent.currentData);
  const rows = useMemo(
    () => uniqueById([...(approved.currentData?.items ?? []), ...(leaseSent.currentData?.items ?? [])]),
    [approved.currentData, leaseSent.currentData],
  );
  const hasMore = approved.currentData?.has_more || leaseSent.currentData?.has_more;

  // With only one of the two lists, someone would look like they aren't ready.
  const emptyList = isLoaded ? (
    <EmptyState body={MESSAGES.noApplicantsBody} heading={MESSAGES.noApplicantsHeading} />
  ) : error ? (
    <EmptyState action={{ label: MESSAGES.tryAgain, onPress: refresh }} body={MESSAGES.checkConnection} heading={MESSAGES.couldntLoadApplicants} />
  ) : (
    <ApplicantsSkeleton label={MESSAGES.loadingApplicants} />
  );

  return (
    <FlatList
      ListEmptyComponent={emptyList}
      ListFooterComponent={hasMore ? <MoreOnWebsite path="/applicants" /> : undefined}
      ListHeaderComponent={
        <View style={{ gap: spacing.sm, padding: spacing.lg }}>
          {error && isLoaded ? <Banner message={SHOWING_LAST_LOADED_MESSAGE} /> : null}
          <Text accessibilityRole="header" style={{ fontSize: fontSize.xl, fontWeight: "600", color: colors.foreground }}>
            {MESSAGES.whoFor}
          </Text>
        </View>
      }
      contentInsetAdjustmentBehavior="automatic"
      data={isLoaded ? rows : []}
      keyExtractor={(applicant) => applicant.id}
      refreshControl={refreshControl}
      renderItem={({ item }) => <ApplicantRow applicant={item} onPress={() => router.push(nextPath({ ...flow, applicantId: item.id }))} showStage />}
      style={{ flex: 1 }}
    />
  );
}
