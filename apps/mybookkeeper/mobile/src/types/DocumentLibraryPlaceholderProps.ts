import type { DocumentReaderMessages } from "./DocumentReaderMessages";

export interface DocumentLibraryPlaceholderProps {
  messages: DocumentReaderMessages;
  isFetching: boolean;
  failed: boolean;
  onRetry: () => void;
}
