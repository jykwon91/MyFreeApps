import type { Document } from "@myjobhunter/api-client/types/document/document";

export interface DocumentsSectionProps {
  applicationId: string;
  /** Undefined until the list has loaded. */
  documents: readonly Document[] | undefined;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void | Promise<void>;
}
