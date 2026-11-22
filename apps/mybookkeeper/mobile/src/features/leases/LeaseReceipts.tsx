import { useGetSignedLeaseByIdQuery } from "@mybookkeeper/api-client/store/signedLeasesApi";
import { rentReceipts } from "@mybookkeeper/api-client/utils/rentReceipts";
import { LoadingButton, LoadingRegion, Skeleton, useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { LEASE_MESSAGES } from "../../constants/leases";
import { TENANT_RECEIPT_MESSAGES } from "../../constants/tenantReceipts";
import { leaseFileLine } from "./leaseDisplay";
import { useOpenLeaseFile } from "./useOpenLeaseFile";

/** One lease's rent receipts, each opened the way the lease screen opens a file. */
export default function LeaseReceipts({ leaseId }: { leaseId: string }) {
  const { colors, spacing, fontSize } = useTheme();
  const { data: lease, isLoading } = useGetSignedLeaseByIdQuery(leaseId);
  const { openingId, open } = useOpenLeaseFile(leaseId);

  if (isLoading) {
    return (
      <LoadingRegion label={TENANT_RECEIPT_MESSAGES.loading}>
        <Skeleton height={64} width="100%" />
      </LoadingRegion>
    );
  }

  return (
    <>
      {rentReceipts(lease?.attachments).map((file) => (
        <View key={file.id} style={{ gap: spacing.sm }}>
          <View style={{ gap: spacing.xs }}>
            <Text style={{ fontSize: fontSize.md, color: colors.foreground }}>{file.filename}</Text>
            <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{leaseFileLine(file)}</Text>
          </View>
          {file.is_available ? (
            <LoadingButton
              accessibilityLabel={`${LEASE_MESSAGES.open} ${file.filename}`}
              disabled={openingId !== null}
              isLoading={openingId === file.id}
              onPress={() => void open(file)}
              variant="secondary"
            >
              {LEASE_MESSAGES.open}
            </LoadingButton>
          ) : (
            <Text style={{ fontSize: fontSize.sm, color: colors.destructiveText }}>{LEASE_MESSAGES.fileMissing}</Text>
          )}
        </View>
      ))}
    </>
  );
}
