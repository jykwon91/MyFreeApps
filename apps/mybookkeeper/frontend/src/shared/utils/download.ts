import { EXPORT_REQUEST_TIMEOUT_MS } from "@platform/core/constants/requestTimeouts";
import api from "@/shared/lib/api";

export async function downloadFile(url: string, filename: string): Promise<void> {
  const res = await api.get(url, { responseType: "blob", timeout: EXPORT_REQUEST_TIMEOUT_MS });
  const blobUrl = URL.createObjectURL(res.data);
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(blobUrl);
}
