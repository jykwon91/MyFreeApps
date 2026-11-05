export interface ChecklistItem {
  expected_type: string;
  expected_from: string | null;
  reason: string;
  status: "received" | "missing";
  document_id: string | null;
}
