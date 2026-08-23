/** Body for POST /welcome-manuals/{id}/sections. */
export interface WelcomeManualSectionCreateRequest {
  title: string;
  body?: string | null;
  /** Omit for a section shared by every room. */
  room_id?: string | null;
}
