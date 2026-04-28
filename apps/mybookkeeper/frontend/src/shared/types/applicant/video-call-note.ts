/**
 * Mirrors backend ``VideoCallNoteResponse``. ``notes`` arrives plaintext.
 */
export interface VideoCallNote {
  id: string;
  applicant_id: string;
  scheduled_at: string;
  completed_at: string | null;
  notes: string | null;
  gut_rating: number | null;
  transcript_storage_key: string | null;
  created_at: string;
  updated_at: string;
}
