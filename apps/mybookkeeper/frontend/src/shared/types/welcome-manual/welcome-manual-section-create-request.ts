/** Body for POST /welcome-manuals/{id}/sections. */
export interface WelcomeManualSectionCreateRequest {
  title: string;
  body?: string | null;
}
