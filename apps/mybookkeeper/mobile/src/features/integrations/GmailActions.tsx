import { LoadingButton, useTheme } from "@platform/mobile";
import { useRef } from "react";
import { View } from "react-native";
import { INTEGRATIONS_MESSAGES as MESSAGES } from "../../constants/integrations";
import type { IntegrationActions } from "../../types/IntegrationActions";
import { askOnce } from "../../lib/askOnce";

interface GmailActionsProps {
  actions: IntegrationActions;
  isSyncing: boolean;
  latestSyncLogId: number | null;
}

/** Sync, stop and disconnect. Starting a sync and disconnecting ask first. */
export default function GmailActions({ actions, isSyncing, latestSyncLogId }: GmailActionsProps) {
  const { spacing } = useTheme();
  const askingSync = useRef(false);
  const askingDisconnect = useRef(false);
  return (
    <View style={{ gap: spacing.sm }}>
      <LoadingButton
        disabled={isSyncing || actions.disconnect.isBusy}
        isLoading={isSyncing || actions.sync.isBusy}
        loadingText={MESSAGES.syncing}
        onPress={() => askOnce(askingSync, MESSAGES.syncConfirmTitle, MESSAGES.syncConfirmBody, { text: MESSAGES.syncStart, onPress: () => void actions.sync.run() })}
        variant="secondary"
      >
        {MESSAGES.syncNow}
      </LoadingButton>
      {isSyncing ? (
        <LoadingButton isLoading={actions.cancel.isBusy} loadingText={MESSAGES.cancelling} onPress={() => void actions.cancel.run(latestSyncLogId ?? undefined)} variant="ghost">
          {MESSAGES.cancelSync}
        </LoadingButton>
      ) : (
        <LoadingButton
          disabled={actions.sync.isBusy}
          isLoading={actions.disconnect.isBusy}
          loadingText={MESSAGES.disconnecting}
          onPress={() =>
            askOnce(askingDisconnect, MESSAGES.disconnectConfirmTitle, MESSAGES.disconnectConfirmBody, {
              text: MESSAGES.disconnectConfirmYes,
              style: "destructive",
              onPress: () => void actions.disconnect.run(),
            })
          }
          variant="destructive"
        >
          {MESSAGES.disconnect}
        </LoadingButton>
      )}
    </View>
  );
}
