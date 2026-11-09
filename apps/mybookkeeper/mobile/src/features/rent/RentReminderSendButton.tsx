import type { RentReminderChannel } from "@mybookkeeper/api-client/types/rent/rent-reminder-channel";
import type { RentReminderPreview } from "@mybookkeeper/api-client/types/rent/rent-reminder-preview";
import { LoadingButton, useTheme } from "@platform/mobile";
import { useRef } from "react";
import { Text, View } from "react-native";
import { confirmTitle, goesBy, REMINDER_MESSAGES, sendNowLabel } from "../../constants/rentReminders";
import { askOnce } from "../../lib/askOnce";
import { channelWords, dueLine, firstNameOf } from "./rentReminderDisplay";

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
  const body = [goesBy(channelWords(channels)), dueLine(preview), "", preview.send_now_message, "", REMINDER_MESSAGES.confirmWarning].join("\n");

  return (
    <View style={{ gap: spacing.sm }}>
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
        onPress={() => askOnce(asking, confirmTitle(name), body, { text: REMINDER_MESSAGES.send, onPress: onConfirmed })}
        variant="secondary"
      >
        {sendNowLabel(firstNameOf(name))}
      </LoadingButton>
    </View>
  );
}
