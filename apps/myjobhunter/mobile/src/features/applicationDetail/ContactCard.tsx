import { contactEmailUrl, contactProfileUrl } from "@myjobhunter/api-client/utils/contactLinkUrls";
import { contactDisplayName } from "@myjobhunter/api-client/utils/contactDisplayName";
import { formatContactRole } from "@myjobhunter/api-client/utils/formatContactRole";
import { Chip, useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { APPLICATION_CONTACT_MESSAGES as MESSAGES } from "../../constants/applicationContacts";
import type { ContactCardProps } from "../../types/ContactCardProps";
import ContactLink from "./ContactLink";

/** Who they are, their role, how to reach them, and any notes. Only http, https and plain-address mailto links open. */
export default function ContactCard({ contact }: ContactCardProps) {
  const { colors, spacing, radius, fontSize } = useTheme();
  const role = formatContactRole(contact.role);
  return (
    <View
      style={{ gap: spacing.xs, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.card }}
      testID={`contact-${contact.id}`}
    >
      <Text style={{ fontSize: fontSize.md, fontWeight: "600", color: colors.foreground }}>{contactDisplayName(contact) ?? MESSAGES.unnamed}</Text>
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
    </View>
  );
}
