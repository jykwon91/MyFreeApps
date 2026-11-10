import { useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { APPLICATION_CONTACT_MESSAGES as MESSAGES } from "../../constants/applicationContacts";
import type { ContactsSectionProps } from "../../types/ContactsSectionProps";
import ContactCard from "./ContactCard";
import SectionHeading from "./SectionHeading";

/** The people on this application, as the website lists them. */
export default function ContactsSection({ contacts }: ContactsSectionProps) {
  const { colors, spacing, fontSize } = useTheme();
  return (
    <View style={{ gap: spacing.md }}>
      <SectionHeading count={contacts.length} title={MESSAGES.title} />
      {contacts.length === 0 ? (
        <Text style={{ fontSize: fontSize.md, color: colors.mutedForeground }}>{MESSAGES.none}</Text>
      ) : (
        contacts.map((contact) => <ContactCard contact={contact} key={contact.id} />)
      )}
    </View>
  );
}
