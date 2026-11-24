import type { RentReminderChannel } from "@mybookkeeper/api-client/types/rent/rent-reminder-channel";
import type { RentReminderPreview } from "@mybookkeeper/api-client/types/rent/rent-reminder-preview";
import { rentReminderChannelWords } from "@mybookkeeper/api-client/utils/rentReminderChannelWords";
import { possiblySentWarning } from "@mybookkeeper/api-client/utils/rentReminderPossiblySent";
import { Banner, LoadingButton, useTheme } from "@platform/mobile";
import { useRef } from "react";
import { Text, View } from "react-native";
import { confirmTitle, goesBy, REMINDER_MESSAGES, sendNowLabel, UNNAMED_TENANT } from "../../constants/rentReminders";
import { askOnce } from "../../lib/askOnce";
import { dueLine, firstNameOf } from "./rentReminderDisplay";

interface RentReminderSendButtonProps {
  name: string | null;
  preview: RentReminderPreview;
  channels: RentReminderChannel[];
  canSend: boolean;
  notes: string[];
  isSending: boolean;
  onConfirmed: () => void;
}

export default function RentReminderSendButton({ name, preview, channels, canSend, notes, isSending, onConfirmed }: RentReminderSendButtonProps) {
  const { colors, spacing, fontSize } = useTheme();
  const asking = useRef(false);
  const possiblySentChannels = preview.possibly_sent.map((p) => p.channel);
  const possiblySent = possiblySentChannels.length > 0;
  const warning = possiblySent ? possiblySentWarning(possiblySentChannels, firstNameOf(name) ?? UNNAMED_TENANT) : null;
  const body = [
    ...(warning ? [warning, ""] : []),
    goesBy(rentReminderChannelWords(channels)),
    dueLine(preview),
    "",
    preview.send_now_message,
    "",
    REMINDER_MESSAGES.confirmWarning,
  ].join("\n");
  const confirmText = possiblySent ? REMINDER_MESSAGES.sendAgain : REMINDER_MESSAGES.send;

  return (
    <View style={{ gap: spacing.sm }}>
      {warning ? <Banner message={warning} /> : null}
      {notes.map((note) => (
        <Text key={note} style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>
          {note}
        </Text>
      ))}
      <LoadingButton
        accessibilityHint={REMINDER_MESSAGES.sendHint}
        disabled={!canSend}
        isLoading={isSending}
        loadingText={REMINDER_MESSAGES.sending}
        onPress={() => askOnce(asking, confirmTitle(name), body, { text: confirmText, onPress: onConfirmed })}
        variant="secondary"
      >
        {sendNowLabel(firstNameOf(name))}
      </LoadingButton>
    </View>
  );
}
