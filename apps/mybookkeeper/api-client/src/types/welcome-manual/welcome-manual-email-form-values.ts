/** Editable text of the email-the-guide form; an empty room_id means none chosen. */
export interface WelcomeManualEmailFormValues {
  recipient_email: string;
  recipient_name: string;
  room_id: string;
}
