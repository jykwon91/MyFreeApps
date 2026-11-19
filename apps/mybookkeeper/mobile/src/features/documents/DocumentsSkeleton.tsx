import { LoadingRegion, useTheme } from "@platform/mobile";
import { DOCUMENT_LIST_MESSAGES } from "../../constants/documents";
import DocumentSkeletonRow from "./DocumentSkeletonRow";

const ROWS = ["a", "b", "c", "d", "e", "f"];

export default function DocumentsSkeleton() {
  const { spacing } = useTheme();
  return (
    <LoadingRegion label={DOCUMENT_LIST_MESSAGES.loading} style={{ gap: spacing.lg, padding: spacing.lg }} testID="documents-skeleton">
      {ROWS.map((row) => (
        <DocumentSkeletonRow key={row} />
      ))}
    </LoadingRegion>
  );
}
