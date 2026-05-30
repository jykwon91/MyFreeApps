/** Body for POST /welcome-manuals/{id}/email. */
export interface WelcomeManualEmailRequest {
  recipient_email: string;
  recipient_name?: string | null;
}
