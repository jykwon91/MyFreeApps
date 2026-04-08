import api from "@/shared/lib/api";
import { showError } from "@/shared/lib/toast-store";

export async function downloadDocument(documentId: string, fileName: string | null): Promise<void> {
  try {
    const res = await api.get(`/documents/${documentId}/download`, { responseType: "blob" });
    const blob = res.data as Blob;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName ?? "document";
    a.click();
    URL.revokeObjectURL(url);
  } catch {
    showError("Failed to download document");
  }
}
