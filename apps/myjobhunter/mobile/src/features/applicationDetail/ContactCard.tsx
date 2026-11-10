import { useRemoveApplicationContactMutation } from "@myjobhunter/api-client/store/applicationsApi";
import { contactEmailUrl, contactProfileUrl } from "@myjobhunter/api-client/utils/contactLinkUrls";
import { contactDisplayName } from "@myjobhunter/api-client/utils/contactDisplayName";
import { formatContactRole } from "@myjobhunter/api-client/utils/formatContactRole";
import { isNotFound } from "@platform/core/utils/isNotFound";
import { Chip, LoadingButton, useTheme, useToast } from "@platform/mobile";
import { useState } from "react";
import { Alert, Text, View } from "react-native";
import { APPLICATION_CONTACT_MESSAGES as MESSAGES } from "../../constants/applicationContacts";
import type { ContactCardProps } from "../../types/ContactCardProps";
import ContactLink from "./ContactLink";

/** Who they are, their role, how to reach them, notes, and Remove. Only http, https and plain-address mailto links open. */
export default function ContactCard({ applicationId, contact }: ContactCardProps) {
  const { colors, spacing, radius, fontSize } = useTheme();
  const { showToast } = useToast();
  const [removeContact] = useRemoveApplicationContactMutation();
  const [isRemoving, setIsRemoving] = useState(false);
  const name = contactDisplayName(contact) ?? MESSAGES.unnamed;
  const role = formatContactRole(contact.role);

  async function remove(): Promise<void> {
    setIsRemoving(true);
    try {
      await removeContact({ applicationId, contactId: contact.id }).unwrap();
      showToast(MESSAGES.removed);
    } catch (error) {
      // A 404 means they're already gone (removed elsewhere, or a double tap): what was asked for.
      // The failed request still refetches the application, so the card drops off.
      if (isNotFound(error)) {
        showToast(MESSAGES.removed);
        return;
      }
      showToast(MESSAGES.couldntRemove, "error");
      setIsRemoving(false);
    }
  }

  function confirmRemove(): void {
    Alert.alert(MESSAGES.removeTitle, `${name} — ${MESSAGES.removeBody}`, [
      { text: MESSAGES.keep, style: "cancel" },
      { text: MESSAGES.remove, style: "destructive", onPress: () => void remove() },
    ]);
  }

  return (
    <View
      style={{ gap: spacing.xs, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.card }}
      testID={`contact-${contact.id}`}
    >
      <Text style={{ fontSize: fontSize.md, fontWeight: "600", color: colors.foreground }}>{name}</Text>
      {role ? (
        <View style={{ flexDirection: "row" }}>
          <Chip label={role} />
        </View>
      ) : null}
      {contact.email ? <ContactLink hint={MESSAGES.emailHint} label={contact.email} url={contactEmailUrl(contact.email)} /> : null}
      {contact.linkedin_url ? (
        <ContactLink hint={MESSAGES.linkedInHint} label={MESSAGES.linkedIn} plainLabel={contact.linkedin_url} url={contactProfileUrl(contact.linkedin_url)} />
      ) : null}
      {contact.notes ? (
        <Text selectable style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>
          {contact.notes}
        </Text>
      ) : null}
      <LoadingButton
        accessibilityLabel={`${MESSAGES.remove} ${name}`}
        isLoading={isRemoving}
        loadingText={MESSAGES.removing}
        onPress={confirmRemove}
        variant="ghost"
      >
        {MESSAGES.remove}
      </LoadingButton>
    </View>
  );
}
