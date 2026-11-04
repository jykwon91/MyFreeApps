export interface BatchStatusResponse {
  batch_id: string;
  total: number;
  completed: number;
  failed: number;
  status: "processing" | "done";
}
