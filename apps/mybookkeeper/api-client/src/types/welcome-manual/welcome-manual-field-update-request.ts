/** Body for PATCH /welcome-manuals/{id}/sections/{sid}/fields/{fieldId}. */
export interface WelcomeManualFieldUpdateRequest {
  label?: string | null;
  value?: string | null;
  display_order?: number;
}
