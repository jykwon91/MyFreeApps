export function attachmentBacksExtension(err: unknown): boolean {
  const code = (err as { data?: { detail?: { code?: unknown } } } | null)?.data?.detail?.code;
  return code === "ATTACHMENT_BACKS_EXTENSION";
}
