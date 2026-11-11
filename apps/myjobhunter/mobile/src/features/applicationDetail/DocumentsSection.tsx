import type { Document } from "@myjobhunter/api-client/types/document/document";
import { EmptyState, LoadMoreFooter, LoadingButton, useTheme } from "@platform/mobile";
import { useState } from "react";
import { View } from "react-native";
import { DOCUMENT_MESSAGES as MESSAGES } from "../../constants/documents";
import { PAGED_LIST_MESSAGES } from "../../constants/pagedListMessages";
import type { DocumentsSectionProps } from "../../types/DocumentsSectionProps";
import DocumentCard from "../documents/DocumentCard";
import DocumentSheet from "../documents/DocumentSheet";
import DocumentUploadSheet from "../documents/DocumentUploadSheet";
import SectionError from "./SectionError";
import SectionHeading from "./SectionHeading";
import SectionSkeletonCards from "./SectionSkeletonCards";

/** The application's documents: write a text one, upload a file, and open, edit or delete each. */
export default function DocumentsSection({
  applicationId,
  documents,
  total,
  isLoading,
  isError,
  hasNextPage,
  isLoadingMore,
  isLoadMoreError,
  onLoadMore,
  onRetry,
}: DocumentsSectionProps) {
  const { spacing } = useTheme();
  const [isWriting, setIsWriting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [editing, setEditing] = useState<Document | null>(null);

  function body() {
    if (isLoading) return <SectionSkeletonCards label={MESSAGES.loading} testID="documents-skeleton" />;
    if (!documents) return isError ? <SectionError message={MESSAGES.couldntLoad} onRetry={onRetry} retryLabel={MESSAGES.tryAgain} /> : null;
    if (documents.length === 0) return <EmptyState body={MESSAGES.noneBody} heading={MESSAGES.none} />;
    return (
      <>
        {documents.map((document) => (
          <DocumentCard document={document} key={document.id} onEdit={setEditing} />
        ))}
        {hasNextPage ? (
          <LoadMoreFooter isError={isLoadMoreError} isLoading={isLoadingMore} messages={PAGED_LIST_MESSAGES} onLoadMore={onLoadMore} shown={documents.length} total={total} />
        ) : null}
      </>
    );
  }

  return (
    <View style={{ gap: spacing.md }}>
      <SectionHeading title={MESSAGES.title} />
      <LoadingButton onPress={() => setIsWriting(true)} variant="secondary">
        {MESSAGES.add}
      </LoadingButton>
      <LoadingButton onPress={() => setIsUploading(true)} variant="secondary">
        {MESSAGES.upload}
      </LoadingButton>
      {body()}
      {isWriting ? <DocumentSheet applicationId={applicationId} onClose={() => setIsWriting(false)} /> : null}
      {isUploading ? <DocumentUploadSheet applicationId={applicationId} onClose={() => setIsUploading(false)} /> : null}
      {editing ? <DocumentSheet applicationId={applicationId} document={editing} key={editing.id} onClose={() => setEditing(null)} /> : null}
    </View>
  );
}
