/** Editable parts of a section on the phone: its text, and the room it is for (empty means every room). */
export interface WelcomeManualSectionFormValues {
  title: string;
  body: string;
  room_id: string;
}
