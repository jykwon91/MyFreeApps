/** Body for POST /welcome-manuals/{id}/sections/{sid}/fields. */
export interface WelcomeManualFieldCreateRequest {
  label: string;
  value?: string | null;
}
