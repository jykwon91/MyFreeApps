export interface Document {
  id: string;
  user_id: string;
  property_id: string | null;
  created_at: string;
  updated_at: string;
  file_name: string | null;
  file_type: string | null;
  document_type: string | null;
  file_mime_type: string | null;
  email_message_id: string | null;
  external_id: string | null;
  external_source: string | null;
  source: "email" | "upload";
  status: "processing" | "extracting" | "completed" | "failed" | "duplicate" | "deleted";
  error_message: string | null;
  batch_id: string | null;
  is_escrow_paid: boolean;
  deleted_at: string | null;
}
