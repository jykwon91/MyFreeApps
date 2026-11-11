import { useRemoveApplicationContactMutation } from "@myjobhunter/api-client/store/applicationsApi";
import { contactEmailUrl, contactProfileUrl } from "@myjobhunter/api-client/utils/contactLinkUrls";
import { contactDisplayName } from "@myjobhunter/api-client/utils/contactDisplayName";
import { formatContactRole } from "@myjobhunter/api-client/utils/formatContactRole";
import { Chip, LoadingButton, useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { APPLICATION_CONTACT_MESSAGES as MESSAGES } from "../../constants/applicationContacts";
import { useConfirmedRemoval } from "../../hooks/useConfirmedRemoval";
import type { ContactCardProps } from "../../types/ContactCardProps";
import ContactLink from "./ContactLink";

/** Who they are, their role, how to reach them, notes, and Remove. Only http, https and plain-address mailto links open. */
export default function ContactCard({ applicationId, contact }: ContactCardProps) {
  const { colors, spacing, radius, fontSize } = useTheme();
  const [removeContact] = useRemoveApplicationContactMutation();
  const name = contactDisplayName(contact) ?? MESSAGES.unnamed;
  const role = formatContactRole(contact.role);
  // Once the contact is gone (deleted, or a 404), it leaves the cached application, so the card drops off
  // even if the reload fails.
  const { isRemoving, confirmRemove } = useConfirmedRemoval(() => removeContact({ applicationId, contactId: contact.id }).unwrap(), {
    ...MESSAGES,
    removeBody: `${name} — ${MESSAGES.removeBody}`,
  });

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
