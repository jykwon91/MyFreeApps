import { INVITE_ROLE_OPTIONS } from "@mybookkeeper/api-client/constants/orgRoles";
import type { AssignableRole } from "@mybookkeeper/api-client/types/organization/AssignableRole";
import { FIELD_PRESETS, FormField, FormSheet, FormSheetCancelButton, LoadingButton, SegmentedControl, useFieldChain, useTheme } from "@platform/mobile";
import { useRef, useState } from "react";
import { Text } from "react-native";
import { MEMBERS_MESSAGES as MESSAGES } from "../../constants/members";
import { isLikelyEmail } from "../../utils/isLikelyEmail";

interface InviteSheetProps {
  orgName: string;
  initialEmail: string;
  initialRole: AssignableRole;
  onClose: () => void;
  /** The problem to show here, or null if the sheet can close. */
  onSend: (email: string, role: AssignableRole) => Promise<string | null>;
}

export default function InviteSheet({ orgName, initialEmail, initialRole, onClose, onSend }: InviteSheetProps) {
  const { colors, fontSize } = useTheme();
  const [email, setEmail] = useState(initialEmail);
  const [role, setRole] = useState(initialRole);
  const [emailError, setEmailError] = useState<string | undefined>();
  const [failure, setFailure] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const isSubmitting = useRef(false);

  const isDirty = email.trim() !== initialEmail.trim() || role !== initialRole;
  const fields = useFieldChain(["email"], { onLast: submit, isLastBlocked: isSending, lastReturnKey: "send" });

  async function submit(): Promise<void> {
    if (isSubmitting.current) return;
    const address = email.trim().toLowerCase();
    if (!isLikelyEmail(address)) {
      setEmailError(MESSAGES.invalidEmail);
      return;
    }
    isSubmitting.current = true;
    setEmailError(undefined);
    setFailure(null);
    setIsSending(true);
    try {
      const problem = await onSend(address, role);
      if (problem) setFailure(problem);
      else onClose();
    } finally {
      isSubmitting.current = false;
      setIsSending(false);
    }
  }

  return (
    <FormSheet failure={failure} hasUnsavedChanges={isDirty} isBusy={isSending} isOpen onRequestClose={onClose} title={MESSAGES.inviteTitle}>
      <FormField
        {...FIELD_PRESETS.otherEmail}
        {...fields.field("email")}
        editable={!isSending}
        error={emailError}
        hint={MESSAGES.emailHint(orgName)}
        label={MESSAGES.email}
        onChangeText={setEmail}
        value={email}
      />
      <Text style={{ fontSize: fontSize.sm, fontWeight: "600", color: colors.foreground }}>{MESSAGES.theirRole}</Text>
      <SegmentedControl accessibilityLabel={MESSAGES.theirRole} onChange={setRole} segments={INVITE_ROLE_OPTIONS} value={role} />
      <LoadingButton isLoading={isSending} loadingText={MESSAGES.sending} onPress={() => void submit()}>
        {MESSAGES.sendInvite}
      </LoadingButton>
      <FormSheetCancelButton>{MESSAGES.cancel}</FormSheetCancelButton>
    </FormSheet>
  );
}
