import type { OrgInvite } from "@mybookkeeper/api-client/types/organization/OrgInvite";
import { LoadingButton, useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { MEMBERS_MESSAGES as MESSAGES } from "../../constants/members";
import { inviteStatusLine } from "./membersDisplay";

interface PendingInviteRowProps {
  invite: OrgInvite;
  now: Date;
  busyLabel?: string;
  /** Something is in flight, and its outcome mustn't land behind a sheet. */
  isHeld: boolean;
  onCancel: () => Promise<void>;
  onInviteAgain: () => void;
}

export default function PendingInviteRow({ invite, now, busyLabel, isHeld, onCancel, onInviteAgain }: PendingInviteRowProps) {
  const { colors, spacing, fontSize } = useTheme();
  return (
    <View style={{ gap: spacing.sm, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border }} testID={`invite-${invite.id}`}>
      <View style={{ gap: spacing.xs }}>
        <Text style={{ fontSize: fontSize.md, fontWeight: "600", color: colors.foreground }}>{invite.email}</Text>
        <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{inviteStatusLine(invite, now)}</Text>
        {invite.email_sent ? null : <Text style={{ fontSize: fontSize.sm, color: colors.destructive }}>{MESSAGES.emailDidntSend}</Text>}
      </View>
      <LoadingButton disabled={isHeld} onPress={onInviteAgain} variant="secondary">
        {MESSAGES.inviteAgain}
      </LoadingButton>
      <LoadingButton isLoading={Boolean(busyLabel)} loadingText={busyLabel} onPress={onCancel} variant="ghost">
        {MESSAGES.cancelInvite}
      </LoadingButton>
    </View>
  );
}
