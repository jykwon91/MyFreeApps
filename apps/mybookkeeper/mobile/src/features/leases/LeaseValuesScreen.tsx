import { useGetSignedLeaseByIdQuery } from "@mybookkeeper/api-client/store/signedLeasesApi";
import { httpStatus } from "@mybookkeeper/api-client/utils/httpStatus";
import { Banner, EmptyState, SHOWING_LAST_LOADED_MESSAGE, useRefresh, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { ScrollView, Text, View } from "react-native";
import { LEASE_DETAIL_MESSAGES as MESSAGES } from "../../constants/leaseDetails";
import { LEASE_MESSAGES } from "../../constants/leases";
import { leaseValueRows } from "./leaseDisplay";
import LeaseValuesSkeleton from "./LeaseValuesSkeleton";

/** Every value filled in on the lease, for reading. The lease's own page stays short. */
export default function LeaseValuesScreen({ id }: { id: string }) {
  const { colors, spacing, fontSize } = useTheme();
  const { currentData: lease, error, isLoading, refetch } = useGetSignedLeaseByIdQuery(id);
  const { refresh, refreshControl } = useRefresh(refetch, error);

  if (isLoading) return <LeaseValuesSkeleton />;
  if (!lease) {
    return httpStatus(error) === 404 ? (
      <EmptyState action={{ label: LEASE_MESSAGES.goBack, onPress: () => router.back() }} body={LEASE_MESSAGES.goneBody} heading={LEASE_MESSAGES.goneHeading} />
    ) : (
      <EmptyState action={{ label: LEASE_MESSAGES.tryAgain, onPress: refresh }} body={LEASE_MESSAGES.checkConnection} heading={LEASE_MESSAGES.couldntLoadOne} />
    );
  }

  const rows = leaseValueRows(lease.values);
  return (
    <ScrollView contentContainerStyle={{ gap: spacing.lg, padding: spacing.lg }} contentInsetAdjustmentBehavior="automatic" refreshControl={refreshControl} testID="lease-values">
      {error ? <Banner message={SHOWING_LAST_LOADED_MESSAGE} /> : null}
      {rows.length === 0 ? <Text style={{ fontSize: fontSize.md, color: colors.mutedForeground }}>{MESSAGES.noDetails}</Text> : null}
      {rows.map((row) => (
        <View accessible key={row.key} style={{ gap: spacing.xs }}>
          <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{row.label}</Text>
          <Text selectable style={{ fontSize: fontSize.md, color: colors.foreground }}>{row.text}</Text>
        </View>
      ))}
    </ScrollView>
  );
}
