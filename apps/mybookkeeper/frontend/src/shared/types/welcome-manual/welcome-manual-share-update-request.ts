/**
 * Body for rotating a welcome manual's share PIN. Omitting the field (or
 * sending ``null``) tells the backend to regenerate a random PIN.
 */
export interface WelcomeManualShareUpdateRequest {
  pin?: string | null;
}
