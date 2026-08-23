/** Body for POST /welcome-manuals/{id}/email. */
export interface WelcomeManualEmailRequest {
  recipient_email: string;
  recipient_name?: string | null;
  /** Which room's guide to send. Required once the manual has rooms. */
  room_id?: string | null;
}
