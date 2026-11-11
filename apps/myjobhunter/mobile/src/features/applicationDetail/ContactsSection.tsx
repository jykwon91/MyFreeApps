import { EmptyState, LoadingButton, useTheme } from "@platform/mobile";
import { useState } from "react";
import { View } from "react-native";
import { APPLICATION_CONTACT_MESSAGES as MESSAGES } from "../../constants/applicationContacts";
import type { ContactsSectionProps } from "../../types/ContactsSectionProps";
import ContactCard from "./ContactCard";
import ContactSheet from "./ContactSheet";
import SectionHeading from "./SectionHeading";

/** The people on this application: add one, reach them, or remove one, as on the website. */
export default function ContactsSection({ applicationId, contacts }: ContactsSectionProps) {
  const { spacing } = useTheme();
  const [isAdding, setIsAdding] = useState(false);
  return (
    <View style={{ gap: spacing.md }}>
      <SectionHeading count={contacts.length} title={MESSAGES.title} />
      <LoadingButton onPress={() => setIsAdding(true)} variant="secondary">
        {MESSAGES.add}
      </LoadingButton>
      {contacts.length === 0 ? (
        <EmptyState body={MESSAGES.noneBody} heading={MESSAGES.none} />
      ) : (
        contacts.map((contact) => <ContactCard applicationId={applicationId} contact={contact} key={contact.id} />)
      )}
      {isAdding ? <ContactSheet applicationId={applicationId} onClose={() => setIsAdding(false)} /> : null}
    </View>
  );
}
