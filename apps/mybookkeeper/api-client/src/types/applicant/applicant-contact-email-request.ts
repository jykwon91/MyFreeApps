/** Request body for PATCH /applicants/{id}/contact-email. `null` removes the address. */
export interface ApplicantContactEmailRequest {
  contact_email: string | null;
}
