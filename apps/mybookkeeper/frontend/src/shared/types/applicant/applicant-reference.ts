/**
 * Mirrors backend ``ReferenceResponse``. PII fields (reference_name,
 * reference_contact) come over the wire as plaintext — backend's
 * ``EncryptedString`` decrypts on read.
 */
export interface ApplicantReference {
  id: string;
  applicant_id: string;
  relationship: string;
  reference_name: string;
  reference_contact: string;
  notes: string | null;
  contacted_at: string | null;
  created_at: string;
  updated_at: string;
}
