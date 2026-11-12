import { AlertBox } from "@platform/ui";
import { CATALOG_COPY } from "@mylanguagetutor/api-client/constants/catalogCopy";

interface CatalogErrorProps {
  onRetry: () => void;
}

export default function CatalogError({ onRetry }: CatalogErrorProps) {
  return (
    <AlertBox variant="error">
      <div className="flex items-center justify-between gap-3">
        <span>{CATALOG_COPY.loadFailed}</span>
        <button
          type="button"
          onClick={onRetry}
          className="min-h-[44px] rounded-md px-3 font-medium underline"
        >
          {CATALOG_COPY.retry}
        </button>
      </div>
    </AlertBox>
  );
}
