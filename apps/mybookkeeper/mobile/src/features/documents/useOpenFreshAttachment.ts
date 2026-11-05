import { useToast } from "@platform/mobile";
import { useRef, useState } from "react";
import { openAttachmentFile } from "./openDocumentFile";

interface OpenableFile {
  id: string;
  filename: string;
  content_type: string;
}

/**
 * Asks for the file's link again before opening it: links expire, and the page
 * showing the file may have been open for a while.
 */
export function useOpenFreshAttachment<File extends OpenableFile>(
  fetchFiles: () => Promise<readonly { id: string; presigned_url: string | null }[]>,
  couldntOpenMessage: string,
): { openingId: string | null; open: (file: File) => Promise<void> } {
  const { showToast } = useToast();
  const [openingId, setOpeningId] = useState<string | null>(null);
  const isOpening = useRef(false);

  async function open(file: File): Promise<void> {
    if (isOpening.current) return;
    isOpening.current = true;
    setOpeningId(file.id);
    try {
      const fresh = await fetchFiles();
      const url = fresh.find((candidate) => candidate.id === file.id)?.presigned_url;
      if (!url) throw new Error("This file has no link");
      await openAttachmentFile(url, file);
    } catch {
      showToast(couldntOpenMessage, "error");
    } finally {
      isOpening.current = false;
      setOpeningId(null);
    }
  }

  return { openingId, open };
}
