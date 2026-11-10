import type { Integration } from "@mybookkeeper/api-client/types/integration/integration";
import type { SyncLog } from "@mybookkeeper/api-client/types/integration/sync-log";
import { getStatusLabel } from "@mybookkeeper/api-client/utils/syncStatusLabel";
import { Banner, useTheme, WebLink } from "@platform/mobile";
import { Text, View } from "react-native";
import { WEB_BASE_URL } from "../../constants/api";
import { INTEGRATIONS_MESSAGES as MESSAGES, INTEGRATIONS_WEB_PATH } from "../../constants/integrations";
import type { GmailConnection } from "../../types/GmailConnection";
import { timeAgo } from "../../utils/timeAgo";
import SyncProgressBar from "./SyncProgressBar";

interface GmailStatusCardProps {
  connection: GmailConnection;
  gmail: Integration | undefined;
  /** The newest sync, while it is still running. */
  runningSync: SyncLog | null;
}

/** The glance: is Gmail working, when it last ran, and what it is doing right now. */
export default function GmailStatusCard({ connection, gmail, runningSync }: GmailStatusCardProps) {
  const { colors, spacing, fontSize } = useTheme();
  const muted = { fontSize: fontSize.sm, color: colors.mutedForeground };
  return (
    <View style={{ gap: spacing.sm }}>
      <Text accessibilityRole="header" style={{ fontSize: fontSize.xl, fontWeight: "600", color: colors.foreground }}>
        {MESSAGES.gmail}
      </Text>
      {connection === "none" ? (
        <>
          <Text style={{ fontSize: fontSize.md, color: colors.foreground }}>{MESSAGES.notConnected}</Text>
          <Text style={muted}>{MESSAGES.intro}</Text>
          <Text style={muted}>{MESSAGES.notConnectedBody}</Text>
        </>
      ) : null}
      {connection === "reauth" ? (
        <>
          <Banner message={MESSAGES.needsReauth} />
          <Text style={muted}>{MESSAGES.needsReauthBody}</Text>
        </>
      ) : null}
      {connection === "connected" ? (
        <Text style={{ fontSize: fontSize.md, color: colors.foreground }}>
          {MESSAGES.connected} · {MESSAGES.lastSynced(gmail?.last_synced_at ? timeAgo(gmail.last_synced_at) : null)}
        </Text>
      ) : null}
      {runningSync ? (
        <View style={{ gap: spacing.xs }}>
          <Text style={{ fontSize: fontSize.sm, color: colors.primary }}>{getStatusLabel(runningSync)}</Text>
          {runningSync.emails_total > 0 ? <SyncProgressBar done={runningSync.emails_done} total={runningSync.emails_total} /> : null}
        </View>
      ) : null}
      {connection !== "connected" ? <WebLink label={MESSAGES.openOnWeb} webBaseUrl={WEB_BASE_URL} webPath={INTEGRATIONS_WEB_PATH} /> : null}
    </View>
  );
}
