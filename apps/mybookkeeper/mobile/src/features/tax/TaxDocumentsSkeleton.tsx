import { LoadingRegion, Skeleton, useTheme } from "@platform/mobile";
import { TAX_DOCUMENTS_MESSAGES as MESSAGES, TAX_DOCUMENTS_SKELETON_ROWS } from "../../constants/taxDocuments";

export default function TaxDocumentsSkeleton() {
  const { spacing } = useTheme();
  return (
    <LoadingRegion label={MESSAGES.loading} style={{ gap: spacing.md, paddingHorizontal: spacing.lg }} testID="tax-documents-skeleton">
      <Skeleton height={20} width="40%" />
      {TAX_DOCUMENTS_SKELETON_ROWS.map((row) => (
        <Skeleton height={44} key={row} width="100%" />
      ))}
    </LoadingRegion>
  );
}
