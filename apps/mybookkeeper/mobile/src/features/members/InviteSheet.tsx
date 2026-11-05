import { INVITE_ROLE_OPTIONS } from "@mybookkeeper/api-client/constants/orgRoles";
import type { AssignableRole } from "@mybookkeeper/api-client/types/organization/AssignableRole";
import { Banner, FormField, LoadingButton, SegmentedControl, useTheme } from "@platform/mobile";
import { useRef, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, ScrollView, Text } from "react-native";
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
  const { colors, spacing, fontSize } = useTheme();
  const [email, setEmail] = useState(initialEmail);
  const [role, setRole] = useState(initialRole);
  const [emailError, setEmailError] = useState<string | undefined>();
  const [failure, setFailure] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const isSubmitting = useRef(false);

  function close(): void {
    if (!isSending) onClose();
  }

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
    <Modal animationType="slide" onRequestClose={close} presentationStyle="pageSheet" visible>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: colors.background }}>
        <ScrollView contentContainerStyle={{ gap: spacing.md, padding: spacing.lg }} keyboardShouldPersistTaps="handled">
          <Text accessibilityRole="header" style={{ fontSize: fontSize.lg, fontWeight: "600", color: colors.foreground }}>
            {MESSAGES.inviteTitle}
          </Text>
          {failure ? <Banner message={failure} /> : null}
          <FormField
            autoCapitalize="none"
            autoComplete="email"
            autoCorrect={false}
            editable={!isSending}
            error={emailError}
            hint={MESSAGES.emailHint(orgName)}
            keyboardType="email-address"
            label={MESSAGES.email}
            onChangeText={setEmail}
            value={email}
          />
          <Text style={{ fontSize: fontSize.sm, fontWeight: "600", color: colors.foreground }}>{MESSAGES.theirRole}</Text>
          <SegmentedControl accessibilityLabel={MESSAGES.theirRole} onChange={setRole} segments={INVITE_ROLE_OPTIONS} value={role} />
          <LoadingButton isLoading={isSending} loadingText={MESSAGES.sending} onPress={() => void submit()}>
            {MESSAGES.sendInvite}
          </LoadingButton>
          <LoadingButton disabled={isSending} onPress={close} variant="ghost">
            {MESSAGES.cancel}
          </LoadingButton>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}
