import type { SyncLog } from "@mybookkeeper/api-client/types/integration/sync-log";
import { getStatusLabel } from "@mybookkeeper/api-client/utils/syncStatusLabel";
import { LoadingButton, useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { INTEGRATIONS_MESSAGES as MESSAGES } from "../../constants/integrations";
import type { IntegrationCancelAction } from "../../types/IntegrationCancelAction";
import { useCanWrite } from "../workspace/useCanWrite";
import SyncProgressBar from "./SyncProgressBar";
import { funnelRows, syncStatusColor } from "./syncSessionDisplay";
import { shortDateTime } from "../../utils/shortDateTime";

/** Everything the website shows for one sync: its status, times, funnel, progress, error, and how to stop it. */
export default function SyncSessionFacts({ log, cancel }: { log: SyncLog; cancel: IntegrationCancelAction }) {
  const { colors, spacing, fontSize } = useTheme();
  const canWrite = useCanWrite();
  const rows = [
    { label: MESSAGES.started, value: shortDateTime(log.started_at) },
    ...(log.completed_at ? [{ label: MESSAGES.completed, value: shortDateTime(log.completed_at) }] : []),
    ...funnelRows(log).map((row) => ({ label: row.label, value: String(row.value) })),
    { label: MESSAGES.documentsAdded, value: String(log.records_added ?? 0) },
  ];
  return (
    <View style={{ gap: spacing.md }}>
      <Text accessibilityRole="header" style={{ fontSize: fontSize.lg, fontWeight: "600", color: syncStatusColor(colors, log.status) }}>
        {getStatusLabel(log)}
      </Text>
      <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{MESSAGES.sessionNumber(log.id)}</Text>
      <View style={{ gap: spacing.xs }}>
        {rows.map((row) => (
          <View key={row.label} style={{ flexDirection: "row", justifyContent: "space-between", gap: spacing.md }}>
            <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{row.label}</Text>
            <Text style={{ fontSize: fontSize.sm, color: colors.foreground }}>{row.value}</Text>
          </View>
        ))}
      </View>
      {log.status === "running" && log.emails_total > 0 ? <SyncProgressBar done={log.emails_done} total={log.emails_total} /> : null}
      {log.status === "running" && canWrite ? (
        <LoadingButton isLoading={cancel.isBusy} loadingText={MESSAGES.cancelling} onPress={() => void cancel.run(log.id)} variant="secondary">
          {MESSAGES.cancelThisSync}
        </LoadingButton>
      ) : null}
      {log.error ? (
        <Text selectable style={{ fontSize: fontSize.sm, color: colors.destructiveText, padding: spacing.sm, backgroundColor: colors.muted }}>
          {log.error}
        </Text>
      ) : null}
    </View>
  );
}
