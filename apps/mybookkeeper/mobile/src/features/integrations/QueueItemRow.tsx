import type { EmailQueueItem } from "@mybookkeeper/api-client/types/integration/email-queue-item";
import { Chip, LoadingButton, useTheme } from "@platform/mobile";
import { useRef } from "react";
import { Text, View } from "react-native";
import { EMAIL_QUEUE_STATUS_LABELS, INTEGRATIONS_MESSAGES as MESSAGES } from "../../constants/integrations";
import { askOnce } from "../../lib/askOnce";
import { useCanWrite } from "../workspace/useCanWrite";
import { useQueueItemActions } from "./useQueueItemActions";

/** One queued email: what it is, how it's going, why it failed, and (for a writer) retry and dismiss. */
export default function QueueItemRow({ item }: { item: EmailQueueItem }) {
  const { colors, spacing, fontSize } = useTheme();
  const canWrite = useCanWrite();
  const actions = useQueueItemActions(item.id);
  const asking = useRef(false);
  const name = item.attachment_filename ?? MESSAGES.emailBody;
  const busy = actions.retry.isBusy || actions.dismiss.isBusy;

  return (
    <View
      accessibilityLabel={[name, item.email_subject, EMAIL_QUEUE_STATUS_LABELS[item.status], item.error].filter(Boolean).join(", ")}
      accessible
      style={{ gap: spacing.xs, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border }}
    >
      <Text numberOfLines={2} style={{ fontSize: fontSize.md, fontWeight: "600", color: colors.foreground }}>
        {name}
      </Text>
      {item.email_subject ? (
        <Text numberOfLines={2} style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>
          {item.email_subject}
        </Text>
      ) : null}
      <Chip label={EMAIL_QUEUE_STATUS_LABELS[item.status]} />
      {item.error ? (
        <Text selectable style={{ fontSize: fontSize.sm, color: item.status === "failed" ? colors.destructiveText : colors.mutedForeground }}>
          {item.error}
        </Text>
      ) : null}
      {canWrite && item.status !== "done" ? (
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          {item.status === "failed" ? (
            <LoadingButton disabled={busy && !actions.retry.isBusy} isLoading={actions.retry.isBusy} loadingText={MESSAGES.retryingItem} onPress={() => void actions.retry.run()} style={{ flex: 1 }} variant="secondary">
              {MESSAGES.retry}
            </LoadingButton>
          ) : null}
          <LoadingButton
              disabled={busy && !actions.dismiss.isBusy}
              isLoading={actions.dismiss.isBusy}
              loadingText={MESSAGES.dismissing}
              onPress={() => askOnce(asking, MESSAGES.dismissConfirmTitle(name), MESSAGES.dismissConfirmBody(item.status), { text: MESSAGES.dismissConfirmYes, style: "destructive", onPress: () => void actions.dismiss.run() })}
              style={{ flex: 1 }}
              variant="ghost"
            >
              {MESSAGES.dismiss}
            </LoadingButton>
        </View>
      ) : null}
    </View>
  );
}
