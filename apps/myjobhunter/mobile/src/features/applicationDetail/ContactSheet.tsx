import { EMPTY_CONTACT_FORM_VALUES } from "@myjobhunter/api-client/constants/emptyContactFormValues";
import { useAddApplicationContactMutation } from "@myjobhunter/api-client/store/applicationsApi";
import type { ContactFormValues } from "@myjobhunter/api-client/types/contact/contact-form-values";
import type { ContactServerErrors } from "@myjobhunter/api-client/types/contact/contact-server-errors";
import { contactFormCounters } from "@myjobhunter/api-client/utils/contactFormCounters";
import { contactCreateRequest } from "@myjobhunter/api-client/utils/contactCreateRequest";
import { contactFormErrors } from "@myjobhunter/api-client/utils/contactFormErrors";
import { contactServerErrors } from "@myjobhunter/api-client/utils/contactServerErrors";
import { hasContactFormErrors } from "@myjobhunter/api-client/utils/hasContactFormErrors";
import { FormField, FormSheet, useTheme, useToast } from "@platform/mobile";
import { useState } from "react";
import { Text } from "react-native";
import { APPLICATION_CONTACT_MESSAGES as MESSAGES } from "../../constants/applicationContacts";
import { CONTACT_ROLE_CHOICES } from "../../constants/contactRoleChoices";
import { contactFieldMessage } from "../../lib/contactFieldMessage";
import { writeFailure } from "../../lib/writeFailure";
import type { ContactSheetProps } from "../../types/ContactSheetProps";
import ChoiceGroup from "../../components/forms/ChoiceGroup";
import SheetButtons from "../../components/forms/SheetButtons";

/**
 * Adds a person to this application. Problems show under their fields, the server's 422 reasons
 * included; a failed add shows at the top and keeps what was typed. No `maxLength`: a pasted value
 * over the limit would be cut silently, so the validator says so instead.
 */
export default function ContactSheet({ applicationId, onClose }: ContactSheetProps) {
  const { colors, fontSize } = useTheme();
  const { showToast } = useToast();
  const [addContact, { isLoading }] = useAddApplicationContactMutation();
  const [values, setValues] = useState<ContactFormValues>(EMPTY_CONTACT_FORM_VALUES);
  const [hasTried, setHasTried] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  // What the server's 422 said about each field, until that field is changed.
  const [serverErrors, setServerErrors] = useState<ContactServerErrors>({});
  const counters = contactFormCounters(values);
  const errors = hasTried ? contactFormErrors(values) : {};

  function change<Field extends keyof ContactFormValues>(field: Field) {
    return (value: ContactFormValues[Field]) => {
      setValues((current) => ({ ...current, [field]: value }));
      setServerErrors(({ [field]: _changed, ...rest }) => rest);
    };
  }

  async function save(): Promise<void> {
    setHasTried(true);
    if (hasContactFormErrors(contactFormErrors(values))) return;
    setFailure(null);
    try {
      await addContact({ applicationId, body: contactCreateRequest(values) }).unwrap();
      showToast(MESSAGES.created);
      onClose();
    } catch (error) {
      const blamed = contactServerErrors(error);
      setServerErrors(blamed);
      setFailure(Object.keys(blamed).length > 0 ? MESSAGES.checkFields : writeFailure(error, MESSAGES.couldntCreate));
    }
  }

  return (
    <FormSheet failure={failure} isOpen onRequestClose={() => (isLoading ? undefined : onClose())} title={MESSAGES.addTitle}>
      <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{MESSAGES.addIntro}</Text>
      <FormField
        autoCapitalize="words"
        editable={!isLoading}
        counter={counters.name}
        error={contactFieldMessage(errors, serverErrors, "name")}
        label={MESSAGES.nameLabel}
        onChangeText={change("name")}
        placeholder={MESSAGES.namePlaceholder}
        value={values.name}
      />
      <FormField
        autoCapitalize="none"
        autoComplete="off"
        autoCorrect={false}
        editable={!isLoading}
        counter={counters.email}
        error={contactFieldMessage(errors, serverErrors, "email")}
        keyboardType="email-address"
        label={MESSAGES.emailLabel}
        onChangeText={change("email")}
        placeholder={MESSAGES.emailPlaceholder}
        value={values.email}
      />
      <ChoiceGroup disabled={isLoading} label={MESSAGES.roleLabel} onChange={change("role")} options={CONTACT_ROLE_CHOICES} value={values.role} />
      <FormField
        autoCapitalize="none"
        autoCorrect={false}
        editable={!isLoading}
        counter={counters.linkedin_url}
        error={contactFieldMessage(errors, serverErrors, "linkedin_url")}
        keyboardType="url"
        label={MESSAGES.linkedInLabel}
        onChangeText={change("linkedin_url")}
        placeholder={MESSAGES.linkedInPlaceholder}
        value={values.linkedin_url}
      />
      <FormField
        editable={!isLoading}
        counter={counters.notes}
        error={contactFieldMessage(errors, serverErrors, "notes")}
        label={MESSAGES.notesLabel}
        multiline
        onChangeText={change("notes")}
        placeholder={MESSAGES.notesPlaceholder}
        value={values.notes}
      />
      <SheetButtons
        cancelLabel={MESSAGES.cancel}
        isSubmitting={isLoading}
        onCancel={onClose}
        onSubmit={save}
        submitLabel={MESSAGES.create}
        submittingLabel={MESSAGES.creating}
      />
    </FormSheet>
  );
}
